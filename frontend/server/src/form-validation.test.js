const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

test('API enforces required demographics, clinical ranges, precise times, and stored emergency details', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medvault-forms-'))
  process.env.MEDVAULT_DB_PATH = path.join(directory, 'test.sqlite')
  const { app, db } = await require('./index').createApp({ seedDemo: true })
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  const csrfResponse = await fetch(`${base}/api/csrf`)
  const csrfCookie = csrfResponse.headers.get('set-cookie').split(';')[0]
  const { csrfToken } = await csrfResponse.json()
  const send = async (route, cookie, body, method = 'POST') => {
    const response = await fetch(`${base}/api/${route}`, { method: body === undefined ? 'GET' : method,
      headers: { Cookie: [csrfCookie, cookie].filter(Boolean).join('; '), 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    const secretary = await send('login', '', { username: 'user2', password: 'user2' })
    const reception = await send('login', '', { username: 'user1', password: 'user1' })
    const patient = { id: 'PTNT-validation', name: 'Validation Patient', age: '35', birthday: '1990-01-01',
      contact: '+639171234567', email: 'patient@gmail.com', emergencyContact: '+639181234567', emergencyRelationship: 'Sibling',
      vitals: {}, medical: {}, appointments: [] }
    const createPatient = after => send('changes', secretary.cookie, { changes: [{ collection: 'patients', id: patient.id, before: null, after }] })
    for (const field of ['age', 'contact', 'emergencyContact', 'emergencyRelationship']) {
      const incomplete = { ...patient }; delete incomplete[field]
      assert.equal((await createPatient(incomplete)).status, 400, field)
    }
    for (const changes of [{ contact: '09171234567' }, { emergencyContact: '+63 9181234567' }, { email: 'user@gnail.com' }, { birthday: '2026-02-30' }, { age: '-1' }]) {
      assert.equal((await createPatient({ ...patient, ...changes })).status, 400)
    }
    for (const [key, value] of Object.entries({ bp: '69/40', hr: '221', temp: '42.1', respRate: '7', spo2: '49', height: '251', weight: '351' })) {
      assert.equal((await createPatient({ ...patient, vitals: { [key]: value } })).status, 400, key)
    }
    const created = await createPatient(patient)
    assert.equal(created.status, 200, JSON.stringify(created.body))
    const visible = (await send('state', reception.cookie)).body.patients.find(item => item.id === patient.id)
    assert.equal(visible.emergencyRelationship, 'Sibling')
    assert.equal(visible.email, 'patient@gmail.com')
    assert.equal((await send('doctor/encounters', secretary.cookie, { patientId: patient.id, vitalsSnapshot: { temp: '43' } })).status, 400)
    const encounter = await send('doctor/encounters', secretary.cookie, { patientId: patient.id, vitalsSnapshot: { temp: '36.7' } })
    assert.equal(encounter.status, 201)
    assert.equal((await send(`doctor/encounters/${encounter.body.id}`, secretary.cookie, { vitalsSnapshot: { hr: '221' } }, 'PATCH')).status, 400)
    const booking = { id: 'APPT-validation', patientId: patient.id, patientName: patient.name, contact: patient.contact,
      doctor: 'Dr. Cruz', date: '2050-01-01', time: '09:17', type: 'Follow-up', status: 'Confirmed' }
    const saveBooking = (after, before = null) => send('changes', secretary.cookie, { changes: [{ collection: 'appointments', id: after.id, before, after }] })
    assert.equal((await saveBooking({ ...booking, date: '2020-01-01' })).status, 400)
    assert.equal((await saveBooking({ ...booking, time: '09:60' })).status, 400)
    assert.equal((await saveBooking({ ...booking, type: 'Anything' })).status, 400)
    const booked = await saveBooking(booking)
    assert.equal(booked.status, 200, JSON.stringify(booked.body))
    assert.equal((await saveBooking({ ...booking, id: 'APPT-overlap', time: '09:46' })).status, 409)
    const schedule = { doctor: booking.doctor, date: booking.date, start: '08:07', end: '17:13', blocked: {}, blockedPeriods: [{ start: '11:07', end: '11:16', reason: 'Unavailable' }] }
    assert.equal((await send('changes', secretary.cookie, { changes: [{ collection: 'schedules', id: `${booking.doctor}|${booking.date}`, before: null, after: schedule }] })).status, 200)
    assert.equal((await saveBooking({ ...booking, id: 'APPT-block-overlap', time: '10:45' })).status, 409)
    assert.equal((await saveBooking({ ...booking, id: 'APPT-after-block', time: '11:16' })).status, 200)
    const stored = created.body.patients.find(item => item.id === patient.id)
    assert.equal((await send('changes', secretary.cookie, { changes: [{ collection: 'patients', id: patient.id, before: stored, after: { ...stored, emergencyRelationship: '' } }] })).status, 400)
    const signup = { username: 'validation.staff', password: 'SecurePass123', confirmPassword: 'SecurePass123', firstName: 'Test', lastName: 'Staff', address: 'Clinic', phone: patient.contact, email: 'staff@gnail.com', role: 'Receptionist' }
    assert.equal((await send('register', '', signup)).status, 400)
    assert.equal((await send('register', '', { ...signup, email: 'staff@outlook.com' })).status, 201)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await db.close()
    if (path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(directory, { recursive: true, force: true })
  }
})
