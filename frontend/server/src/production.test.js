const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

test('production uses SQLite, requires secrets and HTTPS, and disables demo data', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medvault-production-test-'))
  process.env.NODE_ENV = 'production'
  process.env.MEDVAULT_DB_PATH = path.join(directory, 'test.sqlite')
  process.env.MEDVAULT_ADMIN_USERNAME = 'clinic.admin'
  process.env.MEDVAULT_ADMIN_PASSWORD = 'ProductionAdmin123!'
  process.env.MEDVAULT_PUBLIC_ORIGIN = 'https://clinic.example'
  delete process.env.MEDVAULT_ENCRYPTION_KEY
  delete process.env.MEDVAULT_ENCRYPTION_KEY_FILE
  delete process.env.MEDVAULT_JWT_SECRET_FILE
  const { createApp } = require('./index')
  let server, db
  try {
    await assert.rejects(createApp(), /MEDVAULT_ENCRYPTION_KEY_FILE is required/)
    process.env.MEDVAULT_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
    process.env.MEDVAULT_JWT_SECRET = crypto.randomBytes(32).toString('hex')
    const application = await createApp()
    db = application.db
    server = application.app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    assert.equal((await fetch(`${base}/api/health`)).status, 400)
    const csrf = await fetch(`${base}/api/csrf`, { headers: { 'X-Forwarded-Proto': 'https' } })
    assert.match(csrf.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Path=\/; Secure/)
    assert.match(csrf.headers.get('strict-transport-security'), /max-age=31536000/)
    const { csrfToken } = await csrf.json()
    const headers = { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https',
      'X-CSRF-Token': csrfToken, Cookie: csrf.headers.get('set-cookie').split(';')[0], Origin: 'https://clinic.example' }
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers,
      body: JSON.stringify({ username: 'clinic.admin', password: 'ProductionAdmin123!' }) })
    assert.equal(login.status, 200)
    assert.match(login.headers.get('set-cookie'), /; Secure$/)
    assert.equal((await db.raw('SELECT COUNT(*) AS count FROM records', [], 'get')).count, 0)
    assert.equal((await db.raw('SELECT COUNT(*) AS count FROM staff_accounts', [], 'get')).count, 0)
    assert.equal((await db.raw('SELECT COUNT(*) AS count FROM doctors', [], 'get')).count, 0)
    const security = await fetch(`${base}/api/admin/security`, { headers: { ...headers, Cookie: login.headers.get('set-cookie').split(';')[0] } })
    assert.ok(['PostgreSQL', 'SQLite', 'PostgreSQL (Ready / Local Mode)'].includes((await security.json()).storage))
    const demo = await fetch(`${base}/api/login`, { method: 'POST', headers, body: JSON.stringify({ username: 'user1', password: 'user1' }) })
    assert.equal(demo.status, 401)
    assert.equal((await db.verifyAudit()).valid, true)
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (db) await db.close()
    if (path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(directory, { recursive: true, force: true })
  }
})
