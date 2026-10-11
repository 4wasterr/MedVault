const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

test('security controls reject attacks and preserve encrypted clinical data', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medvault-security-test-'))
  process.env.MEDVAULT_DB_PATH = path.join(directory, 'test.sqlite')
  const { app, db, security } = await require('./index').createApp({ seedDemo: true })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const csrf = await fetch(`${base}/api/csrf`)
  const csrfCookie = csrf.headers.get('set-cookie').split(';')[0]
  const { csrfToken } = await csrf.json()
  const send = async (route, cookie = '', body, extra = {}) => {
    const response = await fetch(`${base}/api/${route}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: [cookie, csrfCookie].filter(Boolean).join('; '), 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, ...extra },
      body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, headers: response.headers, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    const login = await send('login', '', { username: 'user2', password: 'user2' })
    const admin = await send('login', '', { username: 'user3', password: 'user3' })
    const reception = await send('login', '', { username: 'user1', password: 'user1' })
    await t.test('JWT signatures, cookie attributes, and security headers', async () => {
      assert.equal(login.cookie.split('=')[1].split('.').length, 3)
      assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/)
      assert.match(login.headers.get('content-security-policy'), /script-src 'self'/)
      assert.equal(login.headers.get('x-content-type-options'), 'nosniff')
      assert.equal((await send('state', login.cookie.slice(0, -2) + 'xx')).status, 401)
      const csrfCookieCheck = await fetch(`${base}/api/csrf`, { headers: { 'X-Forwarded-Proto': 'https' } })
      assert.equal(csrfCookieCheck.headers.get('set-cookie').includes('; Secure'), false)
    })
    await t.test('missing CSRF tokens and hostile origins are denied', async () => {
      assert.equal((await send('logout', login.cookie, {}, { 'X-CSRF-Token': '' })).status, 403)
      assert.equal((await send('logout', login.cookie, {}, { Origin: 'https://attacker.example' })).status, 403)
      assert.equal((await send('state', login.cookie)).status, 200)
    })
    await t.test('five failures lock an account across IP changes', async () => {
      for (let attempt = 0; attempt < 5; attempt++) assert.equal((await send('login', '', { username: 'missing.user', password: 'wrong' })).status, 401)
      const locked = await send('login', '', { username: 'missing.user', password: 'wrong' }, { 'X-Forwarded-For': '203.0.113.90' })
      assert.equal(locked.status, 429)
      assert.ok(Number(locked.headers.get('retry-after')) > 0)
    })
    await t.test('SQL injection and privilege escalation fail', async () => {
      assert.notEqual((await send('login', '', { username: "user2' OR 1=1--", password: 'wrong' })).status, 200)
      assert.equal((await send('admin/accounts', reception.cookie)).status, 403)
      assert.equal((await send('admin/audit', login.cookie)).status, 403)
      assert.equal((await send('state', admin.cookie)).status, 403)
      const state = (await send('state', reception.cookie)).body
      const patient = state.patients[0]
      assert.equal((await send('changes', reception.cookie, { changes: [{ collection: 'patients', id: patient.id, before: patient,
        after: { ...patient, medical: { diagnosis: 'Unauthorized' } } }] })).status, 403)
    })
    await t.test('stored medical fields and audit snapshots are encrypted and authenticated', async () => {
      const patient = { id: 'security-patient', name: 'Test Patient', medical: { diagnosis: 'Confidential diagnosis',
        notes: '<script>alert(1)</script>Safe note; BP < 140; sugar > 5; Ben & Sara' }, appointments: [] }
      assert.equal((await send('changes', login.cookie, { changes: [{ collection: 'patients', id: patient.id, before: null, after: patient }] })).status, 200)
      const raw = (await db.raw('SELECT data FROM records WHERE collection = ? AND id = ?', ['patients', patient.id], 'get')).data
      assert.equal(raw.includes('Confidential diagnosis'), false)
      const decoded = JSON.parse(security.decode(raw))
      assert.equal(decoded.medical.notes, 'Safe note; BP < 140; sugar > 5; Ben & Sara')
      const envelope = JSON.parse(raw)
      envelope.medical.tag = Buffer.alloc(16).toString('base64')
      assert.throws(() => security.decode(JSON.stringify(envelope)))
      const audits = await db.raw('SELECT after_data FROM audit_events WHERE record_id = ?', [patient.id])
      assert.ok(audits.length)
      assert.ok(audits.every(entry => !entry.after_data.includes('Confidential diagnosis')))
    })
    await t.test('audit log is append-only and detects tampering', async () => {
      assert.equal((await db.verifyAudit()).valid, true)
      await assert.rejects(db.raw("UPDATE audit_events SET action = 'altered' WHERE id = 1", [], 'run'), /append-only/)
      await assert.rejects(db.raw('DELETE FROM audit_events WHERE id = 1', [], 'run'), /append-only/)
      const checks = await send('admin/security', admin.cookie)
      assert.equal(checks.body.audit.valid, true)
      assert.equal((await send('admin/audit', admin.cookie)).status, 200)
      const original = await db.raw('SELECT action FROM audit_events WHERE id = 1', [], 'get')
      await db.raw('DROP TRIGGER audit_no_update', [], 'exec')
      await db.raw("UPDATE audit_events SET action = 'forged' WHERE id = 1", [], 'run')
      assert.equal((await db.verifyAudit()).valid, false)
      await db.raw('UPDATE audit_events SET action = ? WHERE id = 1', [original.action], 'run')
      await db.migrateEncryption()
      assert.equal((await db.verifyAudit()).valid, true)
    })
    await t.test('passwords use randomly salted bcrypt and idle sessions expire', async () => {
      const account = await db.prepare('SELECT password_hash FROM staff_accounts WHERE username = ?').get('user2')
      assert.match(account.password_hash, /^\$2[aby]\$12\$/)
      const { hashPassword } = require('./security')
      assert.notEqual(await hashPassword('SecurePass123'), await hashPassword('SecurePass123'))
      const token = login.cookie.split('=')[1]
      const hash = crypto.createHash('sha256').update(token).digest('hex')
      await db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(Date.now() - 31 * 60_000, hash)
      assert.equal((await send('state', login.cookie, undefined, { 'X-MedVault-Background': '1' })).status, 401)
    })
    await t.test('completed request contexts cannot mutate a later transaction', async () => {
      let late
      await db.connection(async () => {
        late = new Promise(resolve => setTimeout(() => resolve(db.prepare("DELETE FROM records WHERE collection = 'patients'").run()), 5))
      })
      await assert.rejects(late, /Request closed before completion/)
      assert.ok((await db.prepare("SELECT COUNT(*) AS count FROM records WHERE collection = 'patients'").get()).count > 0)
    })
    await t.test('records and keys survive a service restart', async () => {
      await new Promise(resolve => server.close(resolve)); await db.close()
      const restarted = await require('./index').createApp()
      assert.equal((await restarted.db.verifyAudit()).valid, true)
      const row = await restarted.db.prepare('SELECT data FROM records WHERE collection = ? AND id = ?').get('patients', 'security-patient')
      assert.equal(JSON.parse(row.data).medical.diagnosis, 'Confidential diagnosis')
      await restarted.db.close()
    })
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve))
    try { await db.close() } catch { /* The restart test closes it first. */ }
    const root = path.resolve(os.tmpdir()) + path.sep
    if (path.resolve(directory).startsWith(root)) fs.rmSync(directory, { recursive: true, force: true })
  }
})
