const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { REQUIRED_TABLES, ensurePostgresSchema, verifyPostgresSchema } = require('./postgres-schema')

test('schema verification rejects a partial installation even when records exists', async () => {
  await assert.rejects(verifyPostgresSchema({ query: async () => ({ rows: [{ table_name: 'records' }] }) }),
    /Missing PostgreSQL tables: sessions/)
})

test('schema changes commit only after all required tables are verified', async () => {
  const queries = []
  const client = { query: async sql => {
    queries.push(sql)
    return { rows: sql.includes('information_schema.tables') ? REQUIRED_TABLES.map(table_name => ({ table_name })) : [] }
  } }
  assert.equal((await ensurePostgresSchema(client)).length, 16)
  assert.equal(queries[0], 'BEGIN')
  assert.equal(queries.at(-1), 'COMMIT')
  client.query = async sql => {
    queries.push(sql)
    if (sql.includes('CREATE TABLE')) throw new Error('permission denied')
    return { rows: [] }
  }
  await assert.rejects(ensurePostgresSchema(client), /permission denied/)
  assert.equal(queries.at(-1), 'ROLLBACK')
})

test('configured PostgreSQL failure does not create a local fallback database', async () => {
  const original = { ...process.env }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medvault-pg-failure-'))
  const filename = path.join(directory, 'must-not-exist.sqlite')
  try {
    const { openStorage } = require('./storage')
    process.env.MEDVAULT_STORAGE = 'postgres'
    process.env.MEDVAULT_TEST_POSTGRES = '1'
    process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused'
    await assert.rejects(openStorage(filename, {}), /PostgreSQL initialization failed/)
    assert.equal(fs.existsSync(filename), false)
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]
    Object.assign(process.env, original)
    fs.rmdirSync(directory)
  }
})
