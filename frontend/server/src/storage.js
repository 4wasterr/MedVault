const { AsyncLocalStorage } = require('node:async_hooks')
const path = require('node:path')
const fs = require('node:fs')
const { auditDigest } = require('./security')
const { Pool } = require('pg')
const { ensurePostgresSchema } = require('./postgres-schema')

// Load .env from common root or server paths if not already loaded
for (const envPath of [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), '.env'),
]) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath, quiet: true })
  }
}

function logAudit(entry) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: 'audit',
    username: entry.username,
    role: entry.role,
    action: entry.action,
    collection: entry.collection,
    recordId: entry.record_id,
    hash: entry.entry_hash,
  }))
}

// Convert SQLite-style ? placeholders to PostgreSQL $1, $2, ...
function sqliteToPgSql(sql) {
  let index = 1
  let inSingle = false
  let inDouble = false
  let result = ''
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (ch === "'" && sql[i - 1] !== '\\') {
      inSingle = !inSingle
      result += ch
    } else if (ch === '"' && sql[i - 1] !== '\\') {
      inDouble = !inDouble
      result += ch
    } else if (ch === '?' && !inSingle && !inDouble) {
      result += `$${index++}`
    } else {
      result += ch
    }
  }
  return result
}

// Translate SQLite-specific statements to PostgreSQL
function translateQuery(sql) {
  let rewritten = sql.trim()

  // PRAGMA table_info(table_name) -> information_schema query
  if (/^PRAGMA\s+table_info\(([^)]+)\)/i.test(rewritten)) {
    const table = /^PRAGMA\s+table_info\(([^)]+)\)/i.exec(rewritten)[1].replace(/['"]/g, '').trim()
    return {
      sql: 'SELECT column_name AS name FROM information_schema.columns WHERE table_name = $1 AND table_schema = current_schema()',
      paramsMapper: () => [table],
      isPragmaInfo: true,
    }
  }

  // Other PRAGMA statements are no-ops in PostgreSQL
  if (/^PRAGMA/i.test(rewritten)) {
    return { sql: 'SELECT 1', paramsMapper: () => [], isNoOp: true }
  }

  // BEGIN IMMEDIATE -> BEGIN
  if (/^BEGIN\s+IMMEDIATE/i.test(rewritten)) {
    rewritten = rewritten.replace(/^BEGIN\s+IMMEDIATE/i, 'BEGIN')
  }

  // SQLite CREATE TRIGGER statements are no-ops in PostgreSQL (triggers handled by schema.sql)
  if (/^CREATE\s+TRIGGER/i.test(rewritten)) {
    return { sql: 'SELECT 1', paramsMapper: () => [], isNoOp: true }
  }

  // Convert SQLite AUTOINCREMENT to PostgreSQL BIGSERIAL
  rewritten = rewritten.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'BIGSERIAL PRIMARY KEY')
  rewritten = rewritten.replace(/AUTOINCREMENT/gi, '')

  return { sql: sqliteToPgSql(rewritten) }
}

function getPostgresConfig() {
  // Unit tests must never write fixtures into a configured clinic database.
  if (process.env.MEDVAULT_STORAGE === 'sqlite' ||
      (process.env.NODE_TEST_CONTEXT && process.env.MEDVAULT_TEST_POSTGRES !== '1')) return null
  if (process.env.DATABASE_URL || process.env.MEDVAULT_PG_URL) {
    return {
      connectionString: process.env.DATABASE_URL || process.env.MEDVAULT_PG_URL,
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000,
    }
  }
  if (process.env.PGHOST || process.env.PGDATABASE) {
    return {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'medvault_user',
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || 'medvault',
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000,
    }
  }
  return null
}

async function createPostgresStorage(pgConfig, security) {
  const pool = new Pool(pgConfig)
  const context = new AsyncLocalStorage()
  let closed = false

  async function connection(operation) {
    const existing = context.getStore()
    if (existing) {
      if (!existing.active) throw new Error('Request closed before completion.')
      return operation()
    }

    const client = await pool.connect()
    const state = { active: true, client, transaction: false, checkpoints: [] }
    try {
      return await context.run(state, async () => {
        try {
          return await operation()
        } finally {
          try {
            if (state.transaction) await client.query('ROLLBACK')
          } catch {}
          state.active = false
        }
      })
    } finally {
      client.release()
    }
  }

  async function raw(sql, params = [], mode = 'all') {
    const state = context.getStore()
    const client = state ? state.client : pool
    const translation = translateQuery(sql)
    if (translation.isNoOp) return mode === 'run' ? { changes: 0 } : []

    const querySql = translation.sql
    const queryParams = translation.paramsMapper ? translation.paramsMapper(params) : params

    try {
      const res = await client.query(querySql, queryParams)
      if (mode === 'exec') return res
      if (mode === 'run') return { changes: res.rowCount || 0 }
      // PostgreSQL returns BIGINT (including COUNT and epoch timestamps) as text.
      // Preserve the numeric API contract without rounding values outside JS's safe range.
      for (const field of res.fields.filter(field => field.dataTypeID === 20)) {
        for (const row of res.rows) {
          if (row[field.name] !== null && Number.isSafeInteger(Number(row[field.name]))) {
            row[field.name] = Number(row[field.name])
          }
        }
      }
      if (mode === 'get') return res.rows[0]
      return res.rows // 'all' or 'iterate'
    } catch (err) {
      // Map PostgreSQL constraint errors to standard code
      if (err.code && (err.code === '23505' || err.code.startsWith('23'))) {
        err.code = 'SQLITE_CONSTRAINT_UNIQUE'
        err.sqlState = '23505'
      }
      throw err
    }
  }

  function decodeRow(row) {
    if (!row) return row
    const result = { ...row }
    for (const field of ['data', 'before_data', 'after_data']) {
      if (typeof result[field] === 'string') result[field] = security.decode(result[field])
    }
    return result
  }

  async function appendAudit(sql, params) {
    const columnsMatch = /audit_events\s*\(([^)]+)\)/i.exec(sql)
    const columns = columnsMatch[1].split(',').map(v => v.trim())
    const entry = Object.fromEntries(columns.map((field, idx) => [field, params[idx]]))
    const state = context.getStore()
    const ownTx = !state.transaction

    if (ownTx) {
      await raw('BEGIN', [], 'exec')
      state.transaction = true
    }
    try {
      await raw('LOCK TABLE audit_events IN SHARE ROW EXCLUSIVE MODE', [], 'exec')
      const prev = await raw('SELECT entry_hash FROM audit_events ORDER BY id DESC LIMIT 1', [], 'get')
      entry.prev_hash = prev?.entry_hash || ''
      entry.entry_hash = auditDigest(entry)
      const fields = [...columns, 'prev_hash', 'entry_hash']
      const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ')
      const insertSql = `INSERT INTO audit_events (${fields.join(', ')}) VALUES (${placeholders})`
      const result = await raw(insertSql, fields.map(f => entry[f]), 'run')

      if (ownTx) {
        await raw('COMMIT', [], 'exec')
        state.transaction = false
        logAudit(entry)
        console.log(JSON.stringify({ timestamp: new Date().toISOString(), event: 'audit_checkpoint', hash: entry.entry_hash }))
      } else {
        state.checkpoints.push(entry)
      }
      return result
    } catch (error) {
      if (ownTx) {
        await raw('ROLLBACK', [], 'exec')
        state.transaction = false
      }
      throw error
    }
  }

  const db = {
    storageType: 'PostgreSQL',
    pool,
    connection,
    middleware: (request, response, next) => {
      connection(() => new Promise(resolve => {
        response.once('finish', resolve)
        response.once('close', resolve)
        next()
      })).catch(next)
    },
    prepare: sql => Object.fromEntries(['all', 'get', 'run'].map(mode => [mode, (...params) => connection(async () => {
      const encoded = params.map(val => typeof val === 'string' && (val.trim().startsWith('[') || val.trim().startsWith('{')) ? security.encode(val) : val)
      const result = /INSERT INTO audit_events/i.test(sql) ? await appendAudit(sql, encoded) : await raw(sql, encoded, mode)
      return mode === 'all' ? result.map(decodeRow) : mode === 'get' ? decodeRow(result) : result
    })])),
    exec: sql => connection(async () => {
      const state = context.getStore()
      const client = state ? state.client : pool
      const translation = translateQuery(sql)
      if (translation.isNoOp) return

      if (sql.startsWith('BEGIN')) state.transaction = true
      const result = await client.query(translation.sql)
      if (/^(COMMIT|ROLLBACK)/i.test(sql)) {
        state.transaction = false
        if (sql.startsWith('COMMIT') && state.checkpoints.length) {
          for (const entry of state.checkpoints) logAudit(entry)
          console.log(JSON.stringify({ timestamp: new Date().toISOString(), event: 'audit_checkpoint', hash: state.checkpoints.at(-1).entry_hash }))
        }
        state.checkpoints = []
      }
      return result
    }),
    raw: (sql, params = [], mode = 'all') => connection(() => raw(sql, params, mode)),
    close: async () => {
      if (!closed) {
        await pool.end()
        closed = true
      }
    },
    verifyAudit: () => connection(async () => {
      const rows = await raw('SELECT * FROM audit_events ORDER BY id', [], 'iterate')
      let previous = ''
      let checked = 0
      for (const row of rows) {
        checked++
        if (row.prev_hash !== previous || row.entry_hash !== auditDigest(row)) return { valid: false, checked, failedAt: row.id }
        previous = row.entry_hash
      }
      return { valid: true, checked, head: previous }
    }),
    migrateEncryption: () => connection(async () => {
      await db.exec('BEGIN')
      try {
        for (const table of ['records', 'visit_records']) {
          const rows = await raw(`SELECT * FROM ${table}`)
          for (const row of rows) {
            const encrypted = security.encode(row.data)
            if (encrypted === row.data) continue
            if (table === 'records') await raw('UPDATE records SET data = $1 WHERE collection = $2 AND id = $3', [encrypted, row.collection, row.id], 'run')
            else await raw('UPDATE visit_records SET data = $1 WHERE patient_id = $2 AND id = $3', [encrypted, row.patient_id, row.id], 'run')
          }
        }
        const unhashed = await raw("SELECT COUNT(*) AS count FROM audit_events WHERE entry_hash = ''", [], 'get')
        if (Number(unhashed.count) > 0) {
          const hashed = await raw("SELECT id FROM audit_events WHERE entry_hash != '' LIMIT 1", [], 'get')
          if (hashed) throw new Error('Audit integrity check failed: partial audit chain.')
          let previous = ''
          for (const row of await raw('SELECT * FROM audit_events ORDER BY id', [], 'iterate')) {
            row.before_data = security.encode(row.before_data)
            row.after_data = security.encode(row.after_data)
            row.prev_hash = previous
            row.entry_hash = auditDigest(row)
            await raw('UPDATE audit_events SET before_data = $1, after_data = $2, prev_hash = $3, entry_hash = $4 WHERE id = $5',
              [row.before_data, row.after_data, row.prev_hash, row.entry_hash, row.id], 'run')
            previous = row.entry_hash
          }
        }
        await db.exec('COMMIT')
      } catch (error) {
        await db.exec('ROLLBACK')
        throw error
      }
    }),
  }
  return db
}

// Local / Offline storage fallback (ensures tests & local dev work smoothly when PG is not connected)
async function createLocalFallbackStorage(filename, security) {
  let sqliteModule
  try {
    sqliteModule = require('node:sqlite')
  } catch (err) {
    throw new Error('PostgreSQL is not connected and local storage module is unavailable: ' + err.message)
  }
  const { DatabaseSync } = sqliteModule
  const context = new AsyncLocalStorage()
  const sqlite = new DatabaseSync(filename)
  let queue = Promise.resolve()
  let closed = false

  async function connection(operation) {
    if (context.getStore()) {
      if (!context.getStore().active) throw new Error('Request closed before completion.')
      return operation()
    }
    let release
    const previous = queue
    queue = new Promise(resolve => { release = resolve })
    await previous
    const state = { active: true, transaction: false, checkpoints: [] }
    try {
      return await context.run(state, async () => {
        try { return await operation() }
        finally {
          try { if (state.transaction) await raw('ROLLBACK', [], 'exec') }
          finally { state.active = false }
        }
      })
    } finally { release() }
  }

  async function raw(sql, params = [], mode = 'all') {
    if (mode === 'exec') return sqlite.exec(sql)
    return sqlite.prepare(sql)[mode](...params)
  }

  function decodeRow(row) {
    if (!row) return row
    const result = { ...row }
    for (const field of ['data', 'before_data', 'after_data']) {
      if (typeof result[field] === 'string') result[field] = security.decode(result[field])
    }
    return result
  }

  async function appendAudit(sql, params) {
    const columns = /audit_events\s*\(([^)]+)\)/i.exec(sql)[1].split(',').map(value => value.trim())
    const entry = Object.fromEntries(columns.map((field, index) => [field, params[index]]))
    const state = context.getStore()
    const ownTransaction = !state.transaction
    if (ownTransaction) { await raw('BEGIN IMMEDIATE', [], 'exec'); state.transaction = true }
    try {
      const previous = await raw('SELECT entry_hash FROM audit_events ORDER BY id DESC LIMIT 1', [], 'get')
      entry.prev_hash = previous?.entry_hash || ''
      entry.entry_hash = auditDigest(entry)
      const fields = [...columns, 'prev_hash', 'entry_hash']
      const result = await raw(`INSERT INTO audit_events (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, fields.map(field => entry[field]), 'run')
      if (ownTransaction) { await raw('COMMIT', [], 'exec'); state.transaction = false }
      if (ownTransaction) {
        logAudit(entry)
        console.log(JSON.stringify({ timestamp: new Date().toISOString(), event: 'audit_checkpoint', hash: entry.entry_hash }))
      } else state.checkpoints.push(entry)
      return result
    } catch (error) { if (ownTransaction) { await raw('ROLLBACK', [], 'exec'); state.transaction = false } throw error }
  }

  const db = {
    storageType: 'SQLite',
    connection,
    middleware: (request, response, next) => {
      connection(() => new Promise(resolve => {
        response.once('finish', resolve); response.once('close', resolve); next()
      })).catch(next)
    },
    prepare: sql => Object.fromEntries(['all', 'get', 'run'].map(mode => [mode, (...params) => connection(async () => {
      const encoded = params.map(value => typeof value === 'string' && (value.trim().startsWith('[') || value.trim().startsWith('{')) ? security.encode(value) : value)
      const result = /INSERT INTO audit_events/i.test(sql) ? await appendAudit(sql, encoded) : await raw(sql, encoded, mode)
      return mode === 'all' ? result.map(decodeRow) : mode === 'get' ? decodeRow(result) : result
    })])),
    exec: sql => connection(async () => {
      const result = await raw(sql, [], 'exec')
      const state = context.getStore()
      if (sql.startsWith('BEGIN')) state.transaction = true
      if (/^(COMMIT|ROLLBACK)/.test(sql)) {
        state.transaction = false
        if (sql.startsWith('COMMIT') && state.checkpoints.length) {
          for (const entry of state.checkpoints) logAudit(entry)
          console.log(JSON.stringify({ timestamp: new Date().toISOString(), event: 'audit_checkpoint', hash: state.checkpoints.at(-1).entry_hash }))
        }
        state.checkpoints = []
      }
      return result
    }),
    raw: (sql, params = [], mode = 'all') => connection(() => raw(sql, params, mode)),
    close: () => connection(() => { if (!closed) { sqlite.close(); closed = true } }),
    verifyAudit: () => connection(async () => {
      const rows = await raw('SELECT * FROM audit_events ORDER BY id', [], 'iterate')
      let previous = ''
      let checked = 0
      for (const row of rows) {
        checked++
        if (row.prev_hash !== previous || row.entry_hash !== auditDigest(row)) return { valid: false, checked, failedAt: row.id }
        previous = row.entry_hash
      }
      return { valid: true, checked, head: previous }
    }),
    migrateEncryption: () => connection(async () => {
      await db.exec('BEGIN IMMEDIATE')
      try {
        for (const table of ['records', 'visit_records']) {
          const rows = await raw(`SELECT * FROM ${table}`)
          for (const row of rows) {
            const encrypted = security.encode(row.data)
            if (encrypted === row.data) continue
            if (table === 'records') await raw('UPDATE records SET data = ? WHERE collection = ? AND id = ?', [encrypted, row.collection, row.id], 'run')
            else await raw('UPDATE visit_records SET data = ? WHERE patient_id = ? AND id = ?', [encrypted, row.patient_id, row.id], 'run')
          }
        }
        const unhashed = await raw("SELECT COUNT(*) AS count FROM audit_events WHERE entry_hash = ''", [], 'get')
        if (unhashed.count) {
          const hashed = await raw("SELECT id FROM audit_events WHERE entry_hash != '' LIMIT 1", [], 'get')
          if (hashed) throw new Error('Audit integrity check failed: partial audit chain.')
          let previous = ''
          for (const row of await raw('SELECT * FROM audit_events ORDER BY id', [], 'iterate')) {
            row.before_data = security.encode(row.before_data)
            row.after_data = security.encode(row.after_data)
            row.prev_hash = previous
            row.entry_hash = auditDigest(row)
            await raw('UPDATE audit_events SET before_data = ?, after_data = ?, prev_hash = ?, entry_hash = ? WHERE id = ?',
              [row.before_data, row.after_data, row.prev_hash, row.entry_hash, row.id], 'run')
            previous = row.entry_hash
          }
        }
        await raw(`CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'Audit log is append-only'); END;
          CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'Audit log is append-only'); END;`, [], 'exec')
        await db.exec('COMMIT')
      } catch (error) { await db.exec('ROLLBACK'); throw error }
      await raw('PRAGMA wal_checkpoint(TRUNCATE)')
    }),
  }
  return db
}

// A configured PostgreSQL connection is authoritative: never silently save elsewhere.
async function openStorage(filename, security) {
  const pgConfig = getPostgresConfig()
  if (pgConfig) {
    const probePool = new Pool(pgConfig)
    let client
    try {
      client = await probePool.connect()
      const tables = await ensurePostgresSchema(client)
      const { rows: [target] } = await client.query('SELECT current_database() AS database, current_user AS username')
      console.log(`[MedVault Database] PostgreSQL active: ${target.database} as ${target.username}; ${tables.length} tables verified.`)
    } catch (err) {
      throw new Error(`PostgreSQL initialization failed: ${err.message}. Check frontend/server/.env and the Linux Mint VM.`, { cause: err })
    } finally {
      if (client) client.release()
      await probePool.end()
    }
    return createPostgresStorage(pgConfig, security)
  }

  return await createLocalFallbackStorage(filename, security)
}

module.exports = { openStorage, getPostgresConfig, sqliteToPgSql, translateQuery }
