const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

test('scheduling, doctor status and patient restoration remain consistent through API writes and restart', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medvault-scheduling-'))
  process.env.MEDVAULT_DB_PATH = path.join(directory, 'test.sqlite')
  process.env.MEDVAULT_TODAY = '2026-10-24'
  const { createApp } = require('./index')
  let { app, db } = await createApp({ seedDemo: true })
  let server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  let base = `http://127.0.0.1:${server.address().port}`
  let csrfCookie, csrfToken
  const csrf = async () => {
    const response = await fetch(`${base}/api/csrf`)
    csrfCookie = response.headers.get('set-cookie').split(';')[0]
    csrfToken = (await response.json()).csrfToken
  }
  const send = async (route, cookie, body, method = 'POST') => {
    const response = await fetch(`${base}/api/${route}`, { method: body === undefined ? 'GET' : method,
      headers: { Cookie: [csrfCookie, cookie].filter(Boolean).join('; '), 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  let secretary, receptionist, admin
  const login = async () => {
    await csrf()
    secretary = (await send('login', '', { username: 'user2', password: 'user2' })).cookie
    receptionist = (await send('login', '', { username: 'user1', password: 'user1' })).cookie
    admin = (await send('login', '', { username: 'user3', password: 'user3' })).cookie
  }
  const state = async (cookie = secretary) => (await send('state', cookie)).body
  const save = async (collection, after, cookie = secretary) => {
    const snapshot = await state(cookie)
    const id = collection === 'schedules' ? `${after.doctor}|${after.date}` : after.id
    const before = collection === 'schedules' ? snapshot.schedules[id] || null : snapshot[collection].find(item => item.id === id) || null
    return send('changes', cookie, { changes: [{ collection, id, before, after }] })
  }
  const patient = { id: 'P-regression', name: 'Regression Patient', age: 36, birthday: '1990-01-01',
    contact: '+639171234567', emergencyContact: '+639181234567', emergencyRelationship: 'Sibling',
    archived: false, isArchived: false, vitals: {}, medical: {}, appointments: [] }
  const booking = (id, time, extra = {}) => ({ id, patientId: patient.id, patientName: patient.name, contact: patient.contact,
    doctor: 'Dr. Cruz', date: '2050-01-01', time, room: 'Room 1', type: 'Follow-up', status: 'Confirmed', ...extra })
  const expectOk = result => assert.equal(result.status, 200, JSON.stringify(result.body))
  const expectConflict = (result, message) => { assert.equal(result.status, 409, JSON.stringify(result.body)); assert.match(result.body.error, message) }
  try {
    await login()
    await t.test('DOB, future dates and unreasonable ages are enforced on create and edit', async () => {
      for (const fields of [{ age: -1 }, { age: 131 }, { age: 35 }, { birthday: '2026-10-25', age: 0 }, { birthday: '2026-02-30', age: 0 }]) {
        assert.equal((await save('patients', { ...patient, ...fields })).status, 400)
      }
      expectOk(await save('patients', patient))
      assert.equal((await save('patients', { ...patient, age: 35 })).status, 400)
      assert.equal((await save('patients', { ...patient, birthday: '1991-01-01' })).status, 400)
    })
    await t.test('full appointment intervals and doctor availability stay inside 8 AM–5 PM', async () => {
      for (const status of ['Open', 'Confirmed']) for (const time of ['07:59', '16:31', '17:00']) {
        expectConflict(await save('appointments', booking(`hours-${status}-${time}`, time, { status })), /clinic operating hours/)
      }
      for (const [start, end] of [['07:59', '17:00'], ['08:00', '17:01'], ['16:45', '17:00']]) {
        assert.equal((await save('schedules', { doctor: 'Dr. Cruz', date: '2050-01-01', start, end, blocked: {} })).status, 400)
      }
      expectOk(await save('appointments', booking('early', '08:00')))
      expectOk(await save('appointments', booking('late', '16:30')))
    })
    await t.test('partial doctor and room conflicts reject while adjacent bookings succeed', async () => {
      expectConflict(await save('appointments', booking('doctor-conflict', '08:29', { room: 'Room 2' })), /doctor already has/)
      expectConflict(await save('appointments', booking('room-conflict', '08:01', { doctor: 'Dr. Reyes' })), /Room 1 is already booked/)
      expectOk(await save('appointments', booking('adjacent', '08:30')))
      expectOk(await save('appointments', booking('open-reservation', '10:00', { doctor: 'Dr. Reyes', room: 'Room 3', status: 'Open' })))
      expectConflict(await save('appointments', booking('open-room-conflict', '10:15', { room: 'Room 3' })), /Room 3 is already booked/)
      expectConflict(await save('appointments', booking('open-doctor-conflict', '10:15', { doctor: 'Dr. Reyes', room: 'Room 4' })), /doctor already has/)
      const open = (await state()).appointments.find(item => item.id === 'open-reservation')
      expectOk(await save('appointments', { ...open, status: 'Confirmed' }))
      expectOk(await save('appointments', { ...open, status: 'Cancelled' }))
      expectOk(await save('appointments', booking('released-room', '10:15', { room: 'Room 3' })))
      assert.equal((await save('schedules', { doctor: 'Dr. Cruz', date: '2050-01-01', start: '08:30', end: '17:00', blocked: {} })).status, 409)
    })
    await t.test('only one concurrent request can reserve a doctor interval', async () => {
      const results = await Promise.all([save('appointments', booking('race-a', '14:00')), save('appointments', booking('race-b', '14:15', { room: 'Room 2' }))])
      assert.deepEqual(results.map(item => item.status).sort(), [200, 409])
    })
    await t.test('consultation starts check active sessions, including the clinical encounter endpoint', async () => {
      for (const [id, time, doctor, room] of [['consult-a', '11:00', 'Dr. Cruz', 'Room 4'], ['consult-b', '12:00', 'Dr. Cruz', 'Room 5'], ['consult-c', '13:00', 'Dr. Reyes', 'Room 4']]) {
        expectOk(await save('appointments', booking(id, time, { doctor, room })))
        const before = (await state()).appointments.find(item => item.id === id)
        expectOk(await save('appointments', { ...before, status: 'Checked-In' }))
      }
      const get = async id => (await state()).appointments.find(item => item.id === id)
      expectOk(await save('appointments', { ...await get('consult-a'), status: 'In Consultation', visitStatus: 'In Consultation' }))
      expectConflict(await save('appointments', { ...await get('consult-b'), status: 'In Consultation', visitStatus: 'In Consultation' }), /Doctor has an ongoing consultation/)
      expectConflict(await save('appointments', { ...await get('consult-c'), status: 'In Consultation', visitStatus: 'In Consultation' }), /Room 4 has an ongoing consultation/)
      const encounter = await send('doctor/encounters', secretary, { patientId: patient.id, appointmentId: 'consult-b', doctorName: 'Dr. Cruz' })
      expectConflict(encounter, /Doctor has an ongoing consultation/)
      assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM encounters WHERE appointment_id = ?').get('consult-b')).count, 0)
      expectOk(await save('appointments', { ...await get('consult-a'), status: 'Completed', visitStatus: 'Completed' }))
      const started = await send('doctor/encounters', secretary, { patientId: patient.id, appointmentId: 'consult-b', doctorName: 'Dr. Cruz' })
      assert.equal(started.status, 201, JSON.stringify(started.body))
      assert.equal((await get('consult-b')).status, 'In Consultation')
    })
    await t.test('inactive doctors are rejected for open slots, booked slots, reschedules and consultation starts', async () => {
      expectOk(await save('appointments', booking('inactive-open', '15:00', { status: 'Open' })))
      expectOk(await save('appointments', booking('inactive-start', '09:30', { status: 'Checked-In' })))
      const doctor = (await state()).doctors.find(item => item.name === 'Dr. Cruz')
      expectOk(await send(`admin/doctors/${doctor.id}`, admin, { active: false }, 'PATCH'))
      for (const cookie of [secretary, receptionist]) {
        const snapshot = await state(cookie)
        assert.equal(snapshot.doctors.find(item => item.id === doctor.id).active, false)
        assert.ok(snapshot.appointments.some(item => item.id === 'early'))
      }
      for (const status of ['Open', 'Confirmed']) assert.equal((await save('appointments', booking(`inactive-${status}`, '15:30', { status }))).status, 400)
      const snapshot = await state()
      const open = snapshot.appointments.find(item => item.id === 'inactive-open')
      assert.equal((await save('appointments', { ...open, status: 'Confirmed' })).status, 400)
      const early = snapshot.appointments.find(item => item.id === 'early')
      assert.equal((await save('appointments', { ...early, time: '15:30' })).status, 400)
      const checkedIn = snapshot.appointments.find(item => item.id === 'inactive-start')
      assert.equal((await save('appointments', { ...checkedIn, status: 'In Consultation', visitStatus: 'In Consultation' })).status, 400)
      const encounter = await send('doctor/encounters', secretary, { patientId: patient.id, appointmentId: checkedIn.id })
      expectConflict(encounter, /active doctor/)
      assert.equal((await save('schedules', { doctor: 'Dr. Cruz', date: '2050-01-02', start: '08:00', end: '17:00', blocked: {} })).status, 400)
    })
    await t.test('patient queries and booking records put new and updated rows first without changing creation dates', async () => {
      const firstPatient = { ...patient, id: 'P-order-first', name: 'First Patient', birthday: '', appointments: [] }
      const secondPatient = { ...firstPatient, id: 'P-order-second', name: 'Second Patient' }
      const firstResult = await save('patients', firstPatient)
      expectOk(firstResult)
      expectOk(await save('patients', secondPatient))
      for (const cookie of [secretary, receptionist]) {
        assert.equal((await state(cookie)).patients[0].id, secondPatient.id)
        const page = await send('patients?page=1&limit=1', cookie)
        assert.equal(page.body.patients[0].id, secondPatient.id)
      }
      const original = (await state()).patients.find(item => item.id === firstPatient.id)
      const edited = await save('patients', { ...original, address: 'Updated address' })
      expectOk(edited)
      assert.equal(edited.body.patients[0].id, firstPatient.id)
      assert.equal(edited.body.patients[0].createdAt, original.createdAt)
      assert.ok(edited.body.patients[0].lastUpdatedAt >= original.lastUpdatedAt)
      assert.equal((await send('patients?page=1&limit=1', receptionist)).body.patients[0].id, firstPatient.id)
      const firstBooking = booking('order-first', '09:00', { date: '2052-01-02', doctor: 'Dr. Reyes' })
      const secondBooking = booking('order-second', '09:00', { date: '2052-01-01', doctor: 'Dr. Reyes' })
      expectOk(await save('appointments', firstBooking))
      expectOk(await save('appointments', secondBooking))
      assert.equal((await state()).appointments[0].id, secondBooking.id)
      const originalBooking = (await state()).appointments.find(item => item.id === firstBooking.id)
      expectOk(await save('appointments', { ...originalBooking, notes: 'Most recently edited booking' }))
      const latest = (await state()).appointments[0]
      assert.equal(latest.id, firstBooking.id)
      assert.equal(latest.createdAt, originalBooking.createdAt)
      assert.ok(latest.lastUpdatedAt >= originalBooking.lastUpdatedAt)
    })
    await t.test('both roles retain archive flags and restoration preserves the profile after restart', async () => {
      let current = (await state()).patients.find(item => item.id === patient.id)
      expectOk(await save('patients', { ...current, archived: true, isArchived: true, archivedAt: new Date().toISOString() }))
      for (const cookie of [secretary, receptionist]) assert.equal((await state(cookie)).patients.find(item => item.id === patient.id).archived, true)
      current = (await state(receptionist)).patients.find(item => item.id === patient.id)
      expectOk(await save('patients', { ...current, archived: false, isArchived: false, archivedAt: '' }, receptionist))
      await new Promise(resolve => server.close(resolve))
      await db.close()
      ;({ app, db } = await createApp())
      server = app.listen(0, '127.0.0.1')
      await new Promise(resolve => server.once('listening', resolve))
      base = `http://127.0.0.1:${server.address().port}`
      await login()
      for (const cookie of [secretary, receptionist]) {
        const restored = (await state(cookie)).patients.find(item => item.id === patient.id)
        assert.equal(restored.archived, false)
        assert.equal(restored.isArchived, false)
        assert.equal(restored.name, patient.name)
        assert.ok(restored.appointments.length > 0)
        const snapshot = await state(cookie)
        assert.equal(snapshot.patients[0].id, patient.id)
        assert.equal(snapshot.appointments[0].id, 'order-first')
        assert.ok(snapshot.appointments[0].createdAt)
        assert.ok(snapshot.appointments[0].lastUpdatedAt)
      }
    })
  } finally {
    await new Promise(resolve => server.close(resolve))
    await db.close()
    delete process.env.MEDVAULT_TODAY
    if (path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(directory, { recursive: true, force: true })
  }
})
