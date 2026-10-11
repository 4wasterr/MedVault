const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { DatabaseSync } = require('node:sqlite')

test('existing plaintext SQLite records, audits and scrypt accounts upgrade without data loss', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medvault-migration-test-'))
  const filename = path.join(directory, 'test.sqlite')
  process.env.MEDVAULT_DB_PATH = filename
  const legacy = new DatabaseSync(filename)
  legacy.exec(`CREATE TABLE records (collection TEXT, id TEXT, data TEXT, PRIMARY KEY(collection, id));
    CREATE TABLE audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, occurred_at TEXT NOT NULL,
      username TEXT NOT NULL, role TEXT NOT NULL, collection TEXT NOT NULL, record_id TEXT NOT NULL,
      action TEXT NOT NULL, before_data TEXT, after_data TEXT);
    CREATE TABLE staff_accounts (username TEXT PRIMARY KEY COLLATE NOCASE, password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL, first_name TEXT NOT NULL, middle_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL, address TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      status TEXT NOT NULL, created_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by TEXT);`)
  const patient = { id: 'legacy-patient', name: 'Existing Patient', medical: { diagnosis: 'Existing confidential diagnosis' },
    visits: [{ id: 'legacy-visit', diagnosis: 'Historical diagnosis' }] }
  legacy.prepare('INSERT INTO records VALUES (?, ?, ?)').run('patients', patient.id, JSON.stringify(patient))
  legacy.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, after_data) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('2026-01-01T00:00:00.000Z', 'legacy.staff', 'Medical Secretary', 'patients', patient.id, 'create', JSON.stringify(patient))
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync('LegacyPass123', salt, 32)
  legacy.prepare(`INSERT INTO staff_accounts (username, password_salt, password_hash, role, first_name, last_name,
    address, phone, email, status, created_at) VALUES (?, ?, ?, 'Medical Secretary', 'Existing', 'Staff', 'Clinic',
    '0000000', 'legacy@clinic.example', 'approved', '2026-01-01T00:00:00.000Z')`).run('legacy.staff', salt.toString('hex'), hash.toString('hex'))
  legacy.close()
  let server, db
  try {
    const { createApp } = require('./index')
    const application = await createApp()
    db = application.db
    assert.equal((await db.verifyAudit()).valid, true)
    assert.equal((await db.raw('SELECT data FROM records', [], 'get')).data.includes('Existing confidential diagnosis'), false)
    assert.equal((await db.raw('SELECT after_data FROM audit_events WHERE id = 1', [], 'get')).after_data.includes('Existing confidential diagnosis'), false)
    const saved = JSON.parse((await db.prepare('SELECT data FROM records').get()).data)
    assert.equal(saved.medical.diagnosis, patient.medical.diagnosis)
    assert.equal(JSON.parse((await db.prepare('SELECT data FROM visit_records').get()).data).diagnosis, 'Historical diagnosis')
    server = application.app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    const csrf = await fetch(`${base}/api/csrf`)
    const { csrfToken } = await csrf.json()
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json',
      Cookie: csrf.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ username: 'legacy.staff', password: 'LegacyPass123' }) })
    assert.equal(login.status, 200)
    assert.match((await db.prepare('SELECT password_hash FROM staff_accounts WHERE username = ?').get('legacy.staff')).password_hash, /^\$2[aby]\$12\$/)
    await new Promise(resolve => server.close(resolve)); server = null
    await db.close(); db = null
    process.env.MEDVAULT_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
    await assert.rejects(createApp(), /authenticate|Unsupported state/)
    delete process.env.MEDVAULT_ENCRYPTION_KEY
    const restarted = await createApp()
    db = restarted.db
    assert.equal(JSON.parse((await db.prepare('SELECT data FROM records').get()).data).medical.diagnosis, patient.medical.diagnosis)
  } finally {
    delete process.env.MEDVAULT_ENCRYPTION_KEY
    if (server) await new Promise(resolve => server.close(resolve))
    if (db) await db.close()
    if (path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(directory, { recursive: true, force: true })
  }
})
