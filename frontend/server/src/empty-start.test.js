const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

test('normal startup and restart stay empty with only bootstrap administrator access', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medvault-empty-test-'))
  process.env.MEDVAULT_DB_PATH = path.join(directory, 'empty.sqlite')
  const { createApp } = require('./index')
  let db, server
  try {
    for (let startup = 0; startup < 2; startup++) {
      const application = await createApp()
      db = application.db
      for (const table of ['records', 'visit_records', 'doctors', 'staff_accounts']) {
        assert.equal((await db.raw(`SELECT COUNT(*) AS count FROM ${table}`, [], 'get')).count, 0)
      }
      assert.equal((await db.verifyAudit()).valid, true)
      if (startup === 0) {
        server = application.app.listen(0, '127.0.0.1')
        await new Promise(resolve => server.once('listening', resolve))
        const base = `http://127.0.0.1:${server.address().port}/api/`
        const csrf = await fetch(`${base}csrf`)
        const { csrfToken } = await csrf.json()
        const headers = { Cookie: csrf.headers.get('set-cookie').split(';')[0],
          'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }
        const admin = await fetch(`${base}login`, { method: 'POST', headers,
          body: JSON.stringify({ username: 'user3', password: 'user3' }) })
        assert.equal(admin.status, 200)
        const signedIn = { Cookie: `${headers.Cookie}; ${admin.headers.get('set-cookie').split(';')[0]}` }
        const overview = await (await fetch(`${base}admin/overview`, { headers: signedIn })).json()
        for (const field of ['staff', 'doctors', 'patients', 'appointments']) assert.equal(overview[field], 0)
        const accounts = await (await fetch(`${base}admin/accounts`, { headers: signedIn })).json()
        assert.equal(accounts.length, 1)
        assert.equal(accounts[0].username, 'user3')
        assert.equal(accounts[0].system, true)
        for (const username of ['user1', 'user2']) {
          const demo = await fetch(`${base}login`, { method: 'POST', headers,
            body: JSON.stringify({ username, password: username }) })
          assert.equal(demo.status, 401)
        }
        await new Promise(resolve => server.close(resolve))
        server = null
      }
      await db.close()
      db = null
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (db) await db.close()
    if (path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(directory, { recursive: true, force: true })
  }
})
