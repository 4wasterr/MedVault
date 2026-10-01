const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')

test('shared records, role authorization, conflicts, and persistence', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medvault-test-'))
  const databasePath = path.join(directory, 'records.sqlite')
  process.env.MEDVAULT_DB_PATH = databasePath
  const { app, db } = require('./index')
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  const request = async (route, cookie, body, method = 'POST') => {
    const response = await fetch(`${base}${route}`, {
      method: body === undefined ? 'GET' : method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    assert.equal((await request('/api/state')).status, 401)
    assert.equal((await request('/api/login', '', { username: 'user1', password: 'wrong' })).status, 401)
    const receptionist = await request('/api/login', '', { username: 'user1', password: 'user1' })
    const secretary = await request('/api/login', '', { username: 'user2', password: 'user2' })
    assert.equal(receptionist.body.role, 'Receptionist')
    assert.equal(secretary.body.role, 'Medical Secretary')
    assert.equal(secretary.body.username, 'user2')
    assert.match(receptionist.cookie, /^medvault_session=/)

    const registration = {
      username: 'new.staff', password: 'SecurePass123', confirmPassword: 'SecurePass123',
      firstName: 'Alex', middleName: '', lastName: 'Rivera', address: '123 Clinic Street',
      phone: '+63 912 345 6789', email: 'alex@example.com', role: 'Medical Secretary',
    }
    assert.equal((await request('/api/register', '', { ...registration, role: 'Super Admin' })).status, 400)
    assert.equal((await request('/api/register', '', registration)).status, 201)
    assert.equal((await request('/api/register', '', registration)).status, 409)
    assert.equal((await request('/api/login', '', { username: registration.username, password: registration.password })).status, 403)
    assert.equal((await request('/api/admin/accounts', receptionist.cookie)).status, 403)
    const admin = await request('/api/login', '', { username: 'user3', password: 'user3' })
    assert.equal(admin.body.role, 'Super Admin')
    assert.equal((await request('/api/state', admin.cookie)).status, 403)
    assert.equal((await request('/api/admin/overview', receptionist.cookie)).status, 403)
    const overview = await request('/api/admin/overview', admin.cookie)
    assert.equal(overview.body.doctors, 4)
    assert.equal(overview.body.patients, 7)
    const requests = await request('/api/admin/accounts', admin.cookie)
    assert.equal(requests.status, 200)
    assert.equal(requests.body[0].status, 'pending')
    assert.ok(requests.body.some((account) => account.username === 'user1' && !account.system))
    assert.ok(requests.body.some((account) => account.username === 'user3' && account.system))
    assert.equal('password_hash' in requests.body[0], false)
    assert.equal((await request(`/api/admin/accounts/${registration.username}/decision`, receptionist.cookie, { decision: 'approve' })).status, 403)
    assert.equal((await request(`/api/admin/accounts/${registration.username}/decision`, admin.cookie, { decision: 'approve' })).status, 200)
    const newStaff = await request('/api/login', '', { username: registration.username, password: registration.password })
    assert.equal(newStaff.body.role, 'Medical Secretary')
    assert.equal((await request('/api/state', newStaff.cookie)).status, 200)
    const managed = { username: 'admin.created', password: 'SecurePass456', firstName: 'Mae', middleName: '',
      lastName: 'Lopez', address: 'Clinic Street', phone: '+63 912 345 6790', email: 'mae@example.com', role: 'Receptionist' }
    assert.equal((await request('/api/admin/accounts', receptionist.cookie, managed)).status, 403)
    assert.equal((await request('/api/admin/accounts', admin.cookie, managed)).status, 201)
    const managedLogin = await request('/api/login', '', { username: managed.username, password: managed.password })
    assert.equal(managedLogin.body.role, 'Receptionist')
    assert.equal((await request(`/api/admin/accounts/${managed.username}`, admin.cookie, { role: 'Medical Secretary' }, 'PATCH')).status, 200)
    assert.equal((await request('/api/state', managedLogin.cookie)).status, 401)
    assert.equal((await request(`/api/admin/accounts/${managed.username}`, admin.cookie, { role: 'Super Admin' }, 'PATCH')).status, 200)
    const promoted = await request('/api/login', '', { username: managed.username, password: managed.password })
    assert.equal(promoted.body.role, 'Super Admin')
    assert.equal((await request('/api/admin/overview', promoted.cookie)).status, 200)
    assert.equal((await request(`/api/admin/accounts/${managed.username}`, admin.cookie, { status: 'deactivated' }, 'PATCH')).status, 200)
    assert.equal((await request('/api/admin/overview', promoted.cookie)).status, 401)
    assert.equal((await request('/api/login', '', { username: managed.username, password: managed.password })).status, 403)
    const doctorCreated = await request('/api/admin/doctors', admin.cookie, { name: 'Dr. New', specialty: 'Family Medicine', secretaryUsername: registration.username })
    assert.equal(doctorCreated.status, 201)
    assert.equal((await request('/api/admin/doctors', receptionist.cookie)).status, 403)
    assert.equal((await request(`/api/admin/accounts/${registration.username}`, admin.cookie, { status: 'deactivated' }, 'PATCH')).status, 409)
    assert.equal((await request(`/api/admin/doctors/${doctorCreated.body.id}`, admin.cookie, { name: 'Dr. Newname' }, 'PATCH')).status, 200)
    assert.ok((await request('/api/state', secretary.cookie)).body.doctors.some((doctor) => doctor.name === 'Dr. Newname'))
    const declinedRegistration = { ...registration, username: 'declined.staff', email: 'declined@example.com', role: 'Receptionist' }
    assert.equal((await request('/api/register', '', declinedRegistration)).status, 201)
    assert.equal((await request(`/api/admin/accounts/${declinedRegistration.username}/decision`, admin.cookie, { decision: 'reject' })).status, 200)
    assert.equal((await request('/api/login', '', { username: declinedRegistration.username, password: declinedRegistration.password })).status, 403)
    const storedAccount = new DatabaseSync(databasePath)
    assert.equal(storedAccount.prepare('SELECT status FROM staff_accounts WHERE username = ?').get(registration.username).status, 'approved')
    storedAccount.close()

    const original = (await request('/api/state', receptionist.cookie)).body
    assert.equal(original.patients.length, 7)
    const browserAppointment = { id: 'APPT-browser', patientId: 'PTNT-browser', patientName: 'Imported Patient',
      doctor: 'Dr. Cruz', date: '2026-10-01', time: '04:00 PM', type: 'Consultation', status: 'Confirmed' }
    const browserRecords = { ...original, appointments: [...original.appointments, browserAppointment] }
    assert.equal((await request('/api/import-legacy', receptionist.cookie, browserRecords)).status, 403)
    assert.equal((await request('/api/import-legacy', secretary.cookie, { ...browserRecords, appointments: [
      ...browserRecords.appointments, { ...browserAppointment, id: 'APPT-duplicate', time: '04:00 PM' },
    ] })).status, 409)
    const imported = await request('/api/import-legacy', secretary.cookie, browserRecords)
    assert.equal(imported.status, 200)
    assert.equal(imported.body.patients.find((item) => item.id === 'PTNT-browser').name, 'Imported Patient')
    assert.equal((await request('/api/import-legacy', secretary.cookie, browserRecords)).status, 409)
    const assignedSchedule = { doctor: 'Dr. Newname', date: '2026-10-02', start: '09:00', end: '17:00', blocked: {} }
    assert.equal((await request('/api/changes', secretary.cookie, { changes: [
      { collection: 'schedules', id: 'Dr. Newname|2026-10-02', before: null, after: assignedSchedule },
    ] })).status, 403)
    assert.equal((await request('/api/changes', newStaff.cookie, { changes: [
      { collection: 'schedules', id: 'Dr. Newname|2026-10-02', before: null, after: assignedSchedule },
    ] })).status, 200)
    const patient = { id: 'PTNT-test', name: 'Test Patient', vitals: {}, medical: {}, appointments: [] }
    const appointment = { id: 'APPT-test', patientId: patient.id, patientName: patient.name,
      doctor: 'Dr. Cruz', date: '2026-10-01', time: '09:00 AM', type: 'Consultation', status: 'Confirmed' }
    const created = await request('/api/changes', receptionist.cookie, { changes: [
      { collection: 'patients', id: patient.id, before: null, after: patient },
      { collection: 'appointments', id: appointment.id, before: null, after: appointment },
    ] })
    assert.equal(created.status, 200)
    assert.equal((await request('/api/changes', receptionist.cookie, { changes: [
      { collection: 'appointments', id: 'APPT-conflict', before: null,
        after: { ...appointment, id: 'APPT-conflict', time: '09:00 AM' } },
    ] })).status, 409)
    assert.equal((await request('/api/changes', receptionist.cookie, { changes: [
      { collection: 'appointments', id: 'APPT-off-grid', before: null,
        after: { ...appointment, id: 'APPT-off-grid', time: '09:15 AM' } },
    ] })).status, 400)
    assert.equal((await request('/api/state', secretary.cookie)).body.appointments.find((item) => item.id === appointment.id).patientId, patient.id)

    const rejectedSchedule = await request('/api/changes', receptionist.cookie, { changes: [
      { collection: 'schedules', id: 'Dr. Cruz|2026-10-01', before: null,
        after: { doctor: 'Dr. Cruz', date: '2026-10-01', start: '09:00', end: '17:00', blocked: {} } },
    ] })
    assert.notEqual(rejectedSchedule.status, 200)
    const schedule = { doctor: 'Dr. Cruz', date: '2026-10-01', start: '08:00', end: '17:00', blocked: { '12:00': 'Lunch' } }
    assert.equal((await request('/api/changes', secretary.cookie, { changes: [
      { collection: 'schedules', id: 'Dr. Cruz|2026-10-01', before: null, after: schedule },
    ] })).status, 200)
    assert.equal((await request('/api/state', receptionist.cookie)).body.schedules['Dr. Cruz|2026-10-01'].blocked['12:00'], 'Lunch')
    assert.equal((await request('/api/changes', receptionist.cookie, { changes: [
      { collection: 'appointments', id: 'APPT-orphan', before: null,
        after: { ...appointment, id: 'APPT-orphan', patientId: 'PTNT-missing' } },
    ] })).status, 400)
    const rejectedClinicalEdit = await request('/api/changes', receptionist.cookie, { changes: [
      { collection: 'patients', id: patient.id, before: patient, after: { ...patient, vitals: { bp: '120/80' } } },
    ] })
    assert.equal(rejectedClinicalEdit.status, 403)

    const updatedPatient = { ...patient, vitals: { bp: '120/80' } }
    assert.equal((await request('/api/changes', secretary.cookie, { changes: [
      { collection: 'patients', id: patient.id, before: patient, after: updatedPatient },
    ] })).status, 200)
    const auditRow = db.prepare("SELECT username, role, before_data, after_data FROM audit_events WHERE collection = 'patients' AND record_id = ? AND action = 'update' ORDER BY id DESC LIMIT 1").get(patient.id)
    assert.equal(auditRow.username, 'user2')
    assert.equal(JSON.parse(auditRow.before_data).id, patient.id)
    assert.equal(JSON.parse(auditRow.after_data).vitals.bp, '120/80')
    const visit = { id: 'visit-test', date: '2026-10-01', doctor: 'Dr. Newname', summary: 'Follow-up' }
    const patientWithVisit = { ...updatedPatient, visits: [visit], consultation: { doctor: 'Dr. Newname', diagnosis: 'Stable' } }
    assert.equal((await request('/api/changes', secretary.cookie, { changes: [
      { collection: 'patients', id: patient.id, before: updatedPatient, after: patientWithVisit },
    ] })).status, 200)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM visit_records WHERE patient_id = ?').get(patient.id).count, 1)
    assert.equal(JSON.parse(db.prepare("SELECT data FROM records WHERE collection = 'patients' AND id = ?").get(patient.id).data).visits, undefined)
    assert.equal((await request('/api/state', receptionist.cookie)).body.patients.find((item) => item.id === patient.id).visits[0].summary, 'Follow-up')
    assert.equal((await request(`/api/admin/doctors/${doctorCreated.body.id}`, admin.cookie, { name: 'Dr. Final' }, 'PATCH')).status, 200)
    assert.ok((await request('/api/state', secretary.cookie)).body.schedules['Dr. Final|2026-10-02'])
    assert.equal((await request('/api/state', receptionist.cookie)).body.patients.find((item) => item.id === patient.id).visits[0].doctor, 'Dr. Final')
    assert.equal((await request('/api/state', receptionist.cookie)).body.patients.find((item) => item.id === patient.id).consultation.doctor, 'Dr. Final')
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE collection = 'visit_records' AND action = 'doctor-rename'").get().count, 1)
    const cancelled = { ...appointment, status: 'Cancelled', cancelledAt: new Date().toISOString() }
    const openSlot = { ...appointment, id: 'APPT-open-test', patientId: null, patientName: '*Available Slot*', status: 'Open' }
    assert.equal((await request('/api/changes', receptionist.cookie, { changes: [
      { collection: 'appointments', id: appointment.id, before: appointment, after: cancelled },
      { collection: 'appointments', id: openSlot.id, before: null, after: openSlot },
    ] })).status, 200)
    assert.equal((await request('/api/state', secretary.cookie)).body.appointments.find((item) => item.id === appointment.id).status, 'Cancelled')
    assert.equal((await request('/api/changes', receptionist.cookie, { changes: [
      { collection: 'appointments', id: appointment.id, before: cancelled, after: null },
    ] })).status, 400)
    assert.equal((await request('/api/changes', receptionist.cookie, { changes: [
      { collection: 'appointments', id: appointment.id, before: cancelled, after: appointment },
    ] })).status, 400)
    const cruz = (await request('/api/admin/doctors', admin.cookie)).body.find((doctor) => doctor.name === 'Dr. Cruz')
    assert.equal((await request(`/api/admin/doctors/${cruz.id}`, admin.cookie, { name: 'Dr. Cruz Updated' }, 'PATCH')).status, 200)
    const renamed = (await request('/api/state', secretary.cookie)).body
    assert.equal(renamed.schedules['Dr. Cruz|2026-10-01'], undefined)
    assert.ok(renamed.schedules['Dr. Cruz Updated|2026-10-01'])
    assert.equal(renamed.appointments.find((item) => item.id === appointment.id).doctor, 'Dr. Cruz Updated')
    assert.equal((await request('/api/changes', secretary.cookie, { changes: [
      { collection: 'patients', id: patient.id, before: patient, after: { ...patient, name: 'Stale edit' } },
    ] })).status, 409)

    const persisted = new DatabaseSync(databasePath)
    assert.equal(JSON.parse(persisted.prepare('SELECT data FROM records WHERE collection = ? AND id = ?').get('patients', patient.id).data).vitals.bp, '120/80')
    persisted.close()
    assert.equal((await request('/api/logout', receptionist.cookie, {})).status, 200)
    assert.equal((await request('/api/state', receptionist.cookie)).status, 401)
    const receptionistAgain = await request('/api/login', '', { username: 'user1', password: 'user1' })
    assert.equal((await request(`/api/admin/accounts/user1`, admin.cookie, { status: 'deactivated' }, 'PATCH')).status, 200)
    assert.equal((await request('/api/state', receptionistAgain.cookie)).status, 401)
    assert.equal((await request('/api/login', '', { username: 'user1', password: 'user1' })).status, 403)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    db.close()
    const root = path.resolve(os.tmpdir()) + path.sep
    if (path.resolve(directory).startsWith(root)) fs.rmSync(directory, { recursive: true, force: true })
  }
})
