#!/usr/bin/env node
const crypto = require('node:crypto')
const { Pool } = require('../frontend/server/node_modules/pg')
const { getPostgresConfig } = require('../frontend/server/src/storage')
const { ensurePostgresSchema, verifyPostgresSchema } = require('../frontend/server/src/postgres-schema')

async function verifyAuditProtection(client, operation) {
  await client.query('BEGIN')
  try {
    const { rows: [row] } = await client.query(`INSERT INTO audit_events
      (occurred_at, username, role, collection, record_id, action)
      VALUES ($1, '__connection_check__', 'System', 'diagnostic', $2, 'connection-check') RETURNING id`,
    [new Date().toISOString(), crypto.randomUUID()])
    let blocked = false
    try {
      const sql = operation === 'UPDATE' ? 'UPDATE audit_events SET action = $1 WHERE id = $2'
        : 'DELETE FROM audit_events WHERE id = $1'
      await client.query(sql, operation === 'UPDATE' ? ['modified', row.id] : [row.id])
    } catch (error) {
      if (!/append-only/i.test(error.message)) throw error
      blocked = true
    }
    if (!blocked) throw new Error(`Audit protection failed: ${operation} was allowed.`)
  } finally {
    await client.query('ROLLBACK')
  }
}

async function main() {
  const config = getPostgresConfig()
  if (!config) throw new Error('Set the VM PostgreSQL connection in frontend/server/.env first.')
  const pool = new Pool(config)
  let client
  try {
    client = await pool.connect()
    const { rows: [info] } = await client.query(`SELECT version(), current_database() AS database,
      current_user AS username, current_schema() AS schema, inet_server_addr() AS address,
      inet_server_port() AS port`)
    console.log(`Connected: ${info.database} / ${info.schema} as ${info.username}`)
    console.log(`Server: ${info.address}:${info.port}; ${info.version.split(' on ')[0]}`)
    const tables = process.argv.includes('--apply') ? await ensurePostgresSchema(client)
      : await verifyPostgresSchema(client)
    for (const table of tables) {
      await client.query(`SELECT 1 FROM ${table} LIMIT 0`)
      console.log(`[OK] ${table}`)
    }

    // Verify real write permissions while leaving no diagnostic records behind.
    await client.query('BEGIN')
    try {
      const id = crypto.randomUUID()
      await client.query("INSERT INTO records (collection, id, data) VALUES ('diagnostic', $1, $2)", [id, '{}'])
      await client.query("UPDATE records SET data = $1 WHERE collection = 'diagnostic' AND id = $2", ['{"verified":true}', id])
      const { rows: [row] } = await client.query("SELECT data FROM records WHERE collection = 'diagnostic' AND id = $1", [id])
      if (JSON.parse(row.data).verified !== true) throw new Error('Database write/read verification failed.')
      await client.query("DELETE FROM records WHERE collection = 'diagnostic' AND id = $1", [id])
    } finally {
      await client.query('ROLLBACK')
    }
    await verifyAuditProtection(client, 'UPDATE')
    await verifyAuditProtection(client, 'DELETE')
    console.log(`PASS: ${tables.length} tables, database read/write, and both audit protections verified. Diagnostic rows rolled back.`)
  } finally {
    if (client) client.release()
    await pool.end()
  }
}

main().catch(error => { console.error(`FAIL: ${error.message}`); process.exitCode = 1 })
