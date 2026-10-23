const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { Pool } = require('pg')

test('PostgreSQL API persists records, repairs partial schemas, and survives restart', {
  skip: process.env.MEDVAULT_TEST_POSTGRES !== '1',
}, async () => {
  const original = { ...process.env }
  const { getPostgresConfig } = require('./storage')
  const { ensurePostgresSchema } = require('./postgres-schema')
  const config = getPostgresConfig()
  assert.ok(config, 'Configure the VM connection in frontend/server/.env')
  const schema = `medvault_test_${crypto.randomBytes(10).toString('hex')}`
  const admin = new Pool(config)
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medvault-postgres-'))
  let db, server, inspector
  let createdSchema = false
  try {
    await admin.query(`CREATE SCHEMA ${schema}`)
    createdSchema = true
    process.env.PGOPTIONS = `-c search_path=${schema}`
    process.env.MEDVAULT_DB_PATH = path.join(directory, 'unused.sqlite')
    process.env.MEDVAULT_ADMIN_USERNAME = 'integration.admin'
    process.env.MEDVAULT_ADMIN_PASSWORD = 'IntegrationPass123!'
    inspector = new Pool({ ...config, options: process.env.PGOPTIONS })
    const client = await inspector.connect()
    try {
      // A records-only installation used to incorrectly skip the entire schema.
      await client.query('CREATE TABLE records (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(collection,id))')
      assert.equal((await ensurePostgresSchema(client)).length, 16)
      assert.equal((await ensurePostgresSchema(client)).length, 16)
    } finally { client.release() }

    const { createApp } = require('./index')
    const application = await createApp()
    db = application.db
    assert.equal(db.storageType, 'PostgreSQL')
    assert.equal((await db.raw('SELECT COUNT(*) AS count FROM records', [], 'get')).count, 0)
    server = application.app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    const csrf = await fetch(`${base}/api/csrf`)
    const csrfCookie = csrf.headers.get('set-cookie').split(';')[0]
    const { csrfToken } = await csrf.json()
    const request = async (route, cookie = '', body) => {
      const response = await fetch(`${base}/api/${route}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Cookie: [csrfCookie, cookie].filter(Boolean).join('; '),
          'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
    }
    assert.equal((await request('health')).body.storage, 'PostgreSQL')
    const adminLogin = await request('login', '', { username: 'integration.admin', password: 'IntegrationPass123!' })
    assert.equal(adminLogin.status, 200)
    const overview = await request('admin/overview', adminLogin.cookie)
    assert.equal(overview.body.patients, 0)
    assert.equal(typeof overview.body.patients, 'number')
    const registration = { username: 'pg.staff', password: 'TestStaffPass123!', confirmPassword: 'TestStaffPass123!',
      firstName: 'Test', lastName: 'Staff', address: 'Test Clinic', phone: '+639123456789', email: 'pg.staff@gmail.com', role: 'Medical Secretary' }
    assert.equal((await request('register', '', registration)).status, 201)
    assert.equal((await request('admin/accounts/pg.staff/decision', adminLogin.cookie, { decision: 'approve' })).status, 200)
    const staff = await request('login', '', { username: registration.username, password: registration.password })
    assert.equal(staff.status, 200)
    const session = await request('session', staff.cookie)
    assert.equal(session.body.username, registration.username)
    assert.equal(session.body.displayName, 'Test Staff')
    assert.equal(session.body.role, 'Medical Secretary')
    const patient = { id: 'PTNT-pg-test', name: 'PostgreSQL Integration Patient', emergencyName: 'Anne  Smith', date: '2026-10-23', createdAt: '2026-10-23T00:00:00Z', age: '35', contact: '+639171234567', emergencyContact: '+639181234567', emergencyRelationship: 'Parent', vitals: {}, medical: {}, appointments: [] }
    const saved = await request('changes', staff.cookie, { changes: [
      { collection: 'patients', id: patient.id, before: null, after: patient },
    ] })
    assert.equal(saved.status, 200, JSON.stringify(saved.body))
    assert.equal((await request('state', staff.cookie)).body.patients[0].name, patient.name)
    const savedPatient = saved.body.patients.find(item => item.id === patient.id)
    assert.equal(savedPatient.emergencyName, 'Anne Smith')
    assert.equal(savedPatient.createdAt, patient.createdAt)
    assert.equal(savedPatient.date, patient.date)
    const clinical = await request('changes', staff.cookie, { changes: [{ collection: 'patients', id: patient.id, before: savedPatient,
      after: { ...savedPatient, medicalHistory: { allergies: 'Saved allergy detail' }, consultation: { diagnosis: 'Saved consultation detail' },
        visits: [{ id: 'visit-pg-test', date: '2026-10-23', doctor: 'Dr. Test', type: 'Follow-up', summary: 'Saved visit' }] } }] })
    assert.equal(clinical.status, 200, JSON.stringify(clinical.body))
    const reloaded = (await request('state', staff.cookie)).body.patients.find(item => item.id === patient.id)
    assert.equal(reloaded.medicalHistory.allergies, 'Saved allergy detail')
    assert.equal(reloaded.consultation.diagnosis, 'Saved consultation detail')
    assert.equal(reloaded.visits[0].summary, 'Saved visit')
    assert.equal(reloaded.createdAt, patient.createdAt)
    assert.equal((await request('admin/overview', adminLogin.cookie)).body.patients, 1)
    const doctor = await request('admin/doctors', adminLogin.cookie, { name: 'Dr. Integration', specialty: 'General Health' })
    assert.equal(doctor.status, 201, JSON.stringify(doctor.body))
    const booking = { id: 'APPT-pg-test', patientId: patient.id, patientName: patient.name, contact: patient.contact,
      doctor: 'Dr. Integration', date: '2050-01-01', time: '09:17', type: 'Follow-up', status: 'Confirmed', room: 'Room 5' }
    const booked = await request('changes', staff.cookie, { changes: [{ collection: 'appointments', id: booking.id, before: null, after: booking }] })
    assert.equal(booked.status, 200, JSON.stringify(booked.body))
    assert.equal(booked.body.patients.find(item => item.id === patient.id).appointments[0].room, 'Room 5')
    assert.equal((await request('admin/overview', adminLogin.cookie)).body.appointments, 1)
    const receptionRegistration = { ...registration, username: 'pg.reception', role: 'Receptionist', firstName: 'Anne', lastName: 'Smith', phone: '+639123456780', email: 'pg.reception@gmail.com' }
    assert.equal((await request('register', '', receptionRegistration)).status, 201)
    assert.equal((await request('admin/accounts/pg.reception/decision', adminLogin.cookie, { decision: 'approve' })).status, 200)
    const reception = await request('login', '', { username: receptionRegistration.username, password: receptionRegistration.password })
    assert.equal((await request('session', reception.cookie)).body.displayName, 'Anne Smith')
    const receptionPatient = (await request('state', reception.cookie)).body.patients.find(item => item.id === patient.id)
    const edited = await request('changes', reception.cookie, { changes: [{ collection: 'patients', id: patient.id, before: receptionPatient,
      after: { ...receptionPatient, contact: '+63 919 123 4567', emergencyName: 'Anne M. Smith' } }] })
    assert.equal(edited.status, 200, JSON.stringify(edited.body))
    const shared = (await request('state', staff.cookie)).body
    assert.equal(shared.patients.find(item => item.id === patient.id).consultation.diagnosis, 'Saved consultation detail')
    assert.equal(shared.appointments.find(item => item.id === booking.id).emergencyName, 'Anne M. Smith')
    assert.equal(shared.appointments.find(item => item.id === booking.id).contact, '+63 919 123 4567')
    const relationalBooking = await inspector.query('SELECT contact, data FROM appointments_rel WHERE id=$1', [booking.id])
    assert.equal(relationalBooking.rows[0].contact, '+63 919 123 4567')
    const { rows: [persisted] } = await inspector.query('SELECT data FROM records WHERE collection=$1 AND id=$2', ['patients', patient.id])
    assert.ok(persisted.data.includes('_medvaultEncrypted'))
    assert.ok(!persisted.data.includes(patient.name))
    assert.equal((await inspector.query('SELECT id FROM patients_rel WHERE id=$1', [patient.id])).rowCount, 1)

    await Promise.all(Array.from({ length: 5 }, (_, i) => db.prepare(`INSERT INTO audit_events
      (occurred_at, username, role, collection, record_id, action) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(new Date().toISOString(), 'integration', 'System', 'test', String(i), 'concurrent-check')))
    assert.equal((await db.verifyAudit()).valid, true)
    const audit = await request('admin/audit', adminLogin.cookie)
    assert.equal(audit.status, 200)
    assert.equal(typeof audit.body.total, 'number')
    for (const operation of ['UPDATE audit_events SET action = action', 'DELETE FROM audit_events']) {
      await assert.rejects(inspector.query(operation), /append-only/)
    }

    await new Promise(resolve => server.close(resolve))
    server = null
    await db.close()
    db = (await createApp()).db
    const restored = await db.prepare("SELECT data FROM records WHERE collection = 'patients' AND id = ?").get(patient.id)
    assert.equal(JSON.parse(restored.data).name, patient.name)
    assert.equal(JSON.parse(restored.data).createdAt, patient.createdAt)
    assert.equal(JSON.parse(restored.data).emergencyName, 'Anne M. Smith')
    assert.equal(JSON.parse(restored.data).consultation.diagnosis, 'Saved consultation detail')
    assert.equal(JSON.parse((await db.prepare('SELECT data FROM visit_records WHERE patient_id = ?').get(patient.id)).data).summary, 'Saved visit')
    assert.equal((await db.verifyAudit()).valid, true)
    assert.equal(fs.existsSync(process.env.MEDVAULT_DB_PATH), false)
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (db) await db.close()
    if (inspector) await inspector.end()
    if (createdSchema) await admin.query(`DROP SCHEMA ${schema} CASCADE`)
    await admin.end()
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]
    Object.assign(process.env, original)
    if (path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('medvault-postgres-')) {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }
})
