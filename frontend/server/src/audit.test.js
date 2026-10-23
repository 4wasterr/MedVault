const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

test('admin audit grid covers all users and preserves workflow integrity', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medvault-audit-test-'))
  process.env.MEDVAULT_DB_PATH = path.join(directory, 'audit.sqlite')
  const { app, db } = await require('./index').createApp({ seedDemo: true })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api/`
  const csrfResponse = await fetch(`${base}csrf`)
  const csrfCookie = csrfResponse.headers.get('set-cookie').split(';')[0]
  const { csrfToken } = await csrfResponse.json()
  const request = async (route, cookie = '', body, method = 'POST', extra = {}) => {
    const response = await fetch(`${base}${route}`, { method: body === undefined ? 'GET' : method,
      headers: { Cookie: [csrfCookie, cookie].filter(Boolean).join('; '), 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, ...extra },
      body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const auditCount = async () => (await db.raw('SELECT COUNT(*) AS count FROM audit_events', [], 'get')).count
  const audits = async (query = '') => (await request(`admin/audit${query}`, admin.cookie)).body
  let admin
  try {
    const reception = await request('login', '', { username: 'user1', password: 'user1' })
    const secretary = await request('login', '', { username: 'user2', password: 'user2' })
    admin = await request('login', '', { username: 'user3', password: 'user3' })

    await t.test('only administrators can review logs, with denied attempts attributed to the actor', async () => {
      assert.equal((await request('admin/audit')).status, 401)
      assert.equal((await request('admin/audit', reception.cookie)).status, 403)
      assert.equal((await request('admin/audit', secretary.cookie)).status, 403)
      const logs = await audits()
      assert.deepEqual(new Set(logs.rows.filter(row => row.action === 'login').map(row => row.role)), new Set(['Receptionist', 'Medical Secretary', 'Super Admin']))
      assert.ok(logs.rows.some(row => row.username === 'user1' && row.action === 'access-denied'))
      assert.ok(logs.rows.some(row => row.username === 'user2' && row.action === 'access-denied'))
    })

    await t.test('views identify actual users, sections and permissions; polling does not create activity', async () => {
      const state = (await request('state', reception.cookie)).body
      const patient = state.patients[0]
      assert.equal((await request('activity', reception.cookie, { collection: 'modules', recordId: 'patients', username: 'forged', role: 'Super Admin', action: 'delete' })).status, 200)
      assert.equal((await request('activity', reception.cookie, { collection: 'patients', recordId: patient.id, section: 'medical' })).status, 200)
      const logged = await audits('?username=user1&action=view')
      assert.ok(logged.rows.every(row => row.username === 'user1' && row.role === 'Receptionist' && row.action === 'view'))
      assert.ok(logged.rows.some(row => row.summary.includes('Medical Information')))
      assert.equal((await request('activity', reception.cookie, { collection: 'modules', recordId: 'audit' })).status, 403)
      assert.equal((await request('activity', admin.cookie, { collection: 'patients', recordId: patient.id, section: 'medical' })).status, 403)
      assert.equal((await request('activity', reception.cookie, { collection: 'patients', recordId: patient.id, section: 'consultation' })).status, 403)
      assert.equal((await request('activity', reception.cookie, { collection: 'patients', recordId: 'missing', section: 'personal' })).status, 404)
      const count = await auditCount()
      await request('state', reception.cookie, undefined, 'GET', { 'X-MedVault-Background': '1' })
      await audits(); await audits()
      assert.equal(await auditCount(), count)
    })

    await t.test('older entries remain reachable, with combined filters, stable sorting and bounded pages', async () => {
      await db.connection(async () => {
        await db.exec('BEGIN IMMEDIATE')
        const insert = db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action) VALUES (?, ?, ?, ?, ?, ?)')
        for (let index = 0; index < 120; index++) await insert.run(new Date(Date.UTC(2020, 0, 1, 0, index)).toISOString(), 'historian', 'Receptionist', 'modules', `fixture_${index}`, 'view')
        await db.exec('COMMIT')
      })
      const query = '?username=historian&role=Receptionist&collection=modules&action=view&sort=occurred_at&order=asc&pageSize=10'
      const first = await audits(query)
      const last = await audits(`${query}&page=12`)
      assert.equal(first.total, 120); assert.equal(first.rows.length, 10)
      assert.equal(first.rows[0].record_id, 'fixture_0')
      assert.equal(last.rows[9].record_id, 'fixture_119')
      assert.equal((await audits(`${query}&page=999`)).page, 12)
      assert.equal((await audits('?search=fixture_119')).total, 1)
      assert.equal((await audits('?search=fixture%25')).total, 0)
      assert.equal((await audits(`${query}&from=2020-01-01T00:00:00.000Z&to=2020-01-01T00:10:00.000Z`)).total, 10)
      assert.ok(first.options.users.includes('user3'))
      for (const invalid of ['?page=-1', '?pageSize=500', '?sort=username%3BDROP%20TABLE%20audit_events', '?order=sideways', '?from=invalid', '?from=2020-01-02T00:00:00.000Z&to=2020-01-01T00:00:00.000Z', '?username=a&username=b']) {
        assert.equal((await request(`admin/audit${invalid}`, admin.cookie)).status, 400)
      }
    })

    await t.test('failed transactions leave no successful-change entries and are recorded as rejected', async () => {
      const patient = { id: 'rollback-patient', name: 'Rollback', medical: {}, vitals: {}, appointments: [] }
      const booking = { id: 'rollback-booking', patientId: 'missing', patientName: 'Unknown', doctor: 'Dr. Cruz', date: '2050-01-01', time: '09:00 AM', status: 'Confirmed' }
      assert.equal((await request('changes', reception.cookie, { changes: [
        { collection: 'patients', id: patient.id, before: null, after: patient },
        { collection: 'appointments', id: booking.id, before: null, after: booking },
      ] })).status, 400)
      assert.equal((await audits('?search=rollback-')).total, 0)
      assert.equal(await db.prepare("SELECT id FROM records WHERE collection = 'patients' AND id = ?").get(patient.id), undefined)
      assert.ok((await audits('?username=user1&action=change-rejected')).total > 0)
      assert.equal((await db.verifyAudit()).valid, true)
    })

    await t.test('visit progress cannot bypass receptionist permissions through patient status or arbitrary booking states', async () => {
      const before = (await request('state', reception.cookie)).body.patients.find(row => row.status === 'Waiting')
      assert.equal((await request('changes', reception.cookie, { changes: [{ collection: 'patients', id: before.id, before, after: { ...before, status: 'Completed' } }] })).status, 403)
      assert.equal((await request('changes', secretary.cookie, { changes: [{ collection: 'patients', id: before.id, before, after: { ...before, name: '' } }] })).status, 400)
      const booking = { id: 'bad-status', patientId: before.id, patientName: before.name, doctor: 'Dr. Cruz', date: '2050-01-01', time: '09:00 AM', status: 'Done' }
      assert.equal((await request('changes', reception.cookie, { changes: [{ collection: 'appointments', id: booking.id, before: null, after: booking }] })).status, 400)
    })

    await t.test('clinical create, update and cascading visit deletion have safe summaries', async () => {
      const patient = { id: 'audit-patient', name: 'Private patient name' , age: '35', contact: '+639171234567', emergencyContact: '+639181234567', emergencyRelationship: 'Parent', medical: { diagnosis: 'Secret diagnosis' }, vitals: {}, appointments: [],
        visits: [{ id: 'audit-visit', type: 'Follow-up', date: '2020-01-01', doctor: 'Dr. Cruz', diagnosis: 'Secret diagnosis' }] }
      const created = await request('changes', secretary.cookie, { changes: [{ collection: 'patients', id: patient.id, before: null, after: patient }] })
      assert.equal(created.status, 200)
      const before = created.body.patients.find(row => row.id === patient.id)
      const updated = await request('changes', secretary.cookie, { changes: [{ collection: 'patients', id: patient.id, before, after: { ...before, vitals: { bp: '120/80' } } }] })
      assert.equal(updated.status, 200)
      const logs = await audits('?search=audit-patient')
      assert.ok(logs.rows.some(row => row.summary.includes('Vitals')))
      const json = JSON.stringify(logs)
      for (const secret of ['Private patient name', 'Secret diagnosis', '120/80', 'before_data', 'after_data', 'password_hash']) assert.equal(json.includes(secret), false)
      assert.equal((await request('changes', secretary.cookie, { changes: [{ collection: 'patients', id: patient.id, before: updated.body.patients.find(row => row.id === patient.id), after: null }] })).status, 200)
      const deleted = await audits('?search=audit-patient&action=delete')
      assert.ok(deleted.rows.some(row => row.collection === 'patients'))
      assert.ok(deleted.rows.some(row => row.collection === 'visit_records'))
    })

    await t.test('password resets and access changes revoke sessions and are visible without secrets', async () => {
      const reset = await request('admin/accounts/user1', admin.cookie, { password: 'ChangedPass123' }, 'PATCH')
      assert.equal(reset.status, 200)
      assert.equal((await request('state', reception.cookie)).status, 401)
      const logs = await audits('?action=password-reset')
      assert.equal(logs.rows[0].username, 'user3'); assert.equal(logs.rows[0].record_id, 'user1')
      assert.equal(JSON.stringify(logs).includes('ChangedPass123'), false)
      const next = await request('login', '', { username: 'user1', password: 'ChangedPass123' })
      assert.equal(next.status, 200)
      assert.equal((await request('logout', next.cookie, {})).status, 200)
      assert.ok((await audits('?username=user1&action=logout')).total > 0)
    })

    await t.test('approval decisions cannot reactivate or reject existing deactivated accounts', async () => {
      assert.equal((await request('admin/accounts/user2', admin.cookie, { status: 'deactivated' }, 'PATCH')).status, 200)
      for (const decision of ['approve', 'reject']) assert.equal((await request('admin/accounts/user2/decision', admin.cookie, { decision })).status, 409)
      assert.equal((await request('state', secretary.cookie)).status, 401)
      assert.equal((await request('login', '', { username: 'user2', password: 'user2' })).status, 403)
      assert.ok((await audits('?username=user2&action=login-denied')).total > 0)
      assert.equal((await db.verifyAudit()).valid, true)
    })
  } finally {
    await new Promise(resolve => server.close(resolve))
    await db.close()
    if (path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(directory, { recursive: true, force: true })
  }
})
