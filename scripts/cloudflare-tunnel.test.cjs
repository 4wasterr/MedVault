const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { prepareTunnelEnvironment, tunnelUrl } = require('./cloudflare-config.cjs')

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'medvault-tunnel-'))
  t.after(() => {
    if (path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(root, { recursive: true, force: true })
  })
  return root
}

test('tunnel configuration preserves records, keys, database settings, and generated credentials across restarts', t => {
  const root = workspace(t)
  const directory = path.join(root, 'frontend/server/data')
  fs.mkdirSync(directory, { recursive: true })
  const encryptionKey = 'ab'.repeat(32)
  fs.writeFileSync(path.join(directory, 'medvault_encryption_key.key'), encryptionKey)
  fs.writeFileSync(path.join(directory, 'medvault_storage.db'), 'existing database')
  fs.writeFileSync(path.join(root, 'frontend/server/.env'), 'PGHOST=127.0.0.1\nPGPORT=5433\nPGDATABASE=medvault\nPGPASSWORD=existing-password\n')
  const first = prepareTunnelEnvironment(root, {})
  const second = prepareTunnelEnvironment(root, {})
  assert.equal(first.NODE_ENV, 'production')
  assert.equal(first.HOST, '127.0.0.1')
  assert.equal(first.PGPORT, '5433')
  assert.equal(first.PGPASSWORD, 'existing-password')
  assert.equal(first.MEDVAULT_ADMIN_USERNAME, 'clinic.admin')
  assert.equal(fs.readFileSync(first.MEDVAULT_ENCRYPTION_KEY_FILE, 'utf8'), encryptionKey)
  assert.equal(fs.readFileSync(first.MEDVAULT_DB_PATH, 'utf8'), 'existing database')
  assert.match(fs.readFileSync(first.MEDVAULT_ADMIN_PASSWORD_FILE, 'utf8'), /^Mv9!.{32}$/)
  for (const key of ['MEDVAULT_ADMIN_PASSWORD_FILE', 'MEDVAULT_JWT_SECRET_FILE']) {
    assert.equal(fs.readFileSync(first[key], 'utf8'), fs.readFileSync(second[key], 'utf8'))
  }
})

test('explicit credentials and secrets are retained; weak public passwords and invalid ports fail', t => {
  const root = workspace(t)
  const configured = { MEDVAULT_ADMIN_USERNAME: 'existing.admin', MEDVAULT_ADMIN_PASSWORD: 'ExistingAdmin123!',
    MEDVAULT_ENCRYPTION_KEY: 'cd'.repeat(32), MEDVAULT_JWT_SECRET: 'ef'.repeat(32), MEDVAULT_TUNNEL_PORT: '5050' }
  const env = prepareTunnelEnvironment(root, configured)
  for (const key of ['MEDVAULT_ADMIN_USERNAME', 'MEDVAULT_ADMIN_PASSWORD', 'MEDVAULT_ENCRYPTION_KEY', 'MEDVAULT_JWT_SECRET']) assert.equal(env[key], configured[key])
  assert.equal(env.PORT, '5050')
  assert.equal(env.MEDVAULT_ENCRYPTION_KEY_FILE, undefined)
  assert.equal(env.MEDVAULT_ADMIN_PASSWORD_FILE, undefined)
  assert.throws(() => prepareTunnelEnvironment(root, { ...configured, MEDVAULT_ADMIN_PASSWORD: 'user3' }), /administrator password/)
  for (const port of ['0', '65536', '5000x']) assert.throws(() => prepareTunnelEnvironment(root, { ...configured, MEDVAULT_TUNNEL_PORT: port }), /port between/)
})

test('only an issued HTTPS trycloudflare hostname becomes the allowed origin', () => {
  assert.equal(tunnelUrl('| https://sample-clinic-123.trycloudflare.com |'), 'https://sample-clinic-123.trycloudflare.com')
  for (const value of ['http://clinic.trycloudflare.com', 'https://clinic.example', 'https://clinic.trycloudflare.com.evil.example', 'https://clinic.trycloudflare.com@evil.example']) assert.equal(tunnelUrl(value), undefined)
})

test('full app serves the built UI, uses secure cookies behind the tunnel, and rejects foreign origins', async t => {
  const root = workspace(t)
  const env = prepareTunnelEnvironment(root, { MEDVAULT_STORAGE: 'sqlite' })
  const original = { ...process.env }
  Object.assign(process.env, env, { MEDVAULT_PUBLIC_ORIGIN: 'https://medvault-test.trycloudflare.com' })
  let server, db
  try {
    const application = await require('../frontend/server/src/index').createApp()
    db = application.db
    server = application.app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    assert.equal((await fetch(`${base}/api/health`)).status, 400)
    const forwarded = { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'medvault-test.trycloudflare.com' }
    assert.equal((await fetch(`${base}/api/health`, { headers: forwarded })).status, 200)
    const page = await fetch(base, { headers: forwarded })
    assert.equal(page.status, 200)
    assert.match(await page.text(), /<title>MedVault<\/title>/)
    const csrf = await fetch(`${base}/api/csrf`, { headers: forwarded })
    assert.match(csrf.headers.get('set-cookie'), /; Secure$/)
    const { csrfToken } = await csrf.json()
    const headers = { ...forwarded, Origin: process.env.MEDVAULT_PUBLIC_ORIGIN, 'Content-Type': 'application/json',
      Cookie: csrf.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': csrfToken }
    const credentials = JSON.stringify({ username: env.MEDVAULT_ADMIN_USERNAME, password: fs.readFileSync(env.MEDVAULT_ADMIN_PASSWORD_FILE, 'utf8') })
    const foreign = await fetch(`${base}/api/login`, { method: 'POST', headers: { ...headers, Origin: 'https://foreign.trycloudflare.com' }, body: credentials })
    assert.equal(foreign.status, 403)
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers, body: credentials })
    assert.equal(login.status, 200)
    assert.match(login.headers.get('set-cookie'), /; Secure$/)
    assert.equal((await login.json()).role, 'Super Admin')
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (db) await db.close()
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]
    Object.assign(process.env, original)
  }
})
