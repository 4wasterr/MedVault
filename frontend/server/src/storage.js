const { AsyncLocalStorage } = require('node:async_hooks')
const { DatabaseSync } = require('node:sqlite')
const { auditDigest } = require('./security')

function logAudit(entry) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event: 'audit', username: entry.username,
    role: entry.role, action: entry.action, collection: entry.collection, recordId: entry.record_id, hash: entry.entry_hash }))
}

async function openStorage(filename, security) {
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
    try { return await context.run(state, async () => {
      try { return await operation() }
      finally {
        try { if (state.transaction) await raw('ROLLBACK', [], 'exec') }
        finally { state.active = false }
      }
    }) }
    finally { release() }
  }
  async function raw(sql, params = [], mode = 'all') {
    if (mode === 'exec') return sqlite.exec(sql)
    return sqlite.prepare(sql)[mode](...params)
  }
  function decodeRow(row) {
    if (!row) return row
    const result = { ...row }
    for (const field of ['data', 'before_data', 'after_data']) if (typeof result[field] === 'string') result[field] = security.decode(result[field])
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
        // Legacy entries have no chain; migrate once before append-only triggers are installed.
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
module.exports = { openStorage }
