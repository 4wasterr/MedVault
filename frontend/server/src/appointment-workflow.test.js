const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

test('existing patients can be booked from canonical and polling snapshots without losing clinical data', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medvault-appointment-flow-'))
  process.env.MEDVAULT_DB_PATH = path.join(directory, 'test.sqlite')
  const { app, db } = await require('./index').createApp({ seedDemo: true })
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}/api/`
  const csrfResponse = await fetch(`${base}csrf`)
  const csrfCookie = csrfResponse.headers.get('set-cookie').split(';')[0]
  const { csrfToken } = await csrfResponse.json()
  const request = async (route, cookie, body) => {
    const response = await fetch(`${base}${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: [csrfCookie, cookie].filter(Boolean).join('; '), 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    const secretary = await request('login', '', { username: 'user2', password: 'user2' })
    const receptionist = await request('login', '', { username: 'user1', password: 'user1' })
    const initialState = (await request('state', secretary.cookie)).body
    assert.equal(initialState.doctors.find(doctor => doctor.name === 'Dr. Cruz').specialty, 'General Health')
    assert.equal(initialState.doctors.find(doctor => doctor.name === 'Dr. Reyes').specialty, 'Cardiologist')
    const patient = { id: 'PTNT-booking-flow', name: 'Booking Flow', age: '35', contact: '+63 917 123 4567',
      emergencyContact: '+63 918 123 4567', emergencyRelationship: 'Sibling', specialty: 'Pediatrics', type: 'Follow-up',
      vitals: { bp: '120/80' }, medical: {}, medicalHistory: {}, consultation: {}, visits: [], recordNotes: [], appointments: [] }
    const booking = { id: 'APPT-booking-flow', patientId: patient.id, patientName: patient.name,
      contact: patient.contact, emergencyContact: patient.emergencyContact, emergencyRelationship: patient.emergencyRelationship,
      doctor: 'Dr. Santos', specialty: 'Pediatrics', date: '2050-01-01', time: '09:00', type: 'New Consultation', status: 'Confirmed', visitStatus: 'Waiting' }
    const created = await request('changes', secretary.cookie, { changes: [
      { collection: 'patients', id: patient.id, before: null, after: patient },
      { collection: 'appointments', id: booking.id, before: null, after: booking },
    ] })
    assert.equal(created.status, 200, JSON.stringify(created.body))
    let current = created.body.patients.find(item => item.id === patient.id)
    assert.equal(current.specialty, 'Pediatrics')
    assert.equal(current.type, 'Follow-up')
    assert.equal(current.appointments[0].specialty, 'Pediatrics')
    assert.equal(current.appointments[0].emergencyRelationship, 'Sibling')
    const secondBooking = { ...booking, id: 'APPT-booking-flow-second', time: '10:00' }
    const booked = await request('changes', receptionist.cookie, { changes: [
      { collection: 'patients', id: patient.id, before: current,
        after: { ...current, appointments: [{ sourceAppointmentId: secondBooking.id, doctor: secondBooking.doctor, type: secondBooking.type, date: secondBooking.date }, ...current.appointments] } },
      { collection: 'appointments', id: secondBooking.id, before: null, after: secondBooking },
    ] })
    assert.equal(booked.status, 200, JSON.stringify(booked.body))
    assert.equal(booked.body.appointments.filter(item => item.patientId === patient.id).length, 2)
    const polling = await request('state?minimum=1', receptionist.cookie)
    const filtered = polling.body.patients.find(item => item.id === patient.id)
    assert.deepEqual(filtered.vitals, {})
    assert.equal(filtered.hasPreviousVisit, false)
    assert.equal(filtered.type, 'Follow-up')
    const edited = await request('changes', receptionist.cookie, { changes: [
      { collection: 'patients', id: patient.id, before: filtered, after: { ...filtered, address: 'Updated Clinic Street' } },
    ] })
    assert.equal(edited.status, 200, JSON.stringify(edited.body))
    current = edited.body.patients.find(item => item.id === patient.id)
    assert.equal(current.vitals.bp, '120/80')
    assert.equal(current.address, 'Updated Clinic Street')
    assert.equal((await request('changes', receptionist.cookie, { changes: [
      { collection: 'patients', id: patient.id, before: filtered, after: { ...filtered, address: 'Stale Street' } },
    ] })).status, 409)
    assert.equal((await request('changes', secretary.cookie, { changes: [
      { collection: 'appointments', id: 'APPT-wrong-specialty', before: null,
        after: { ...booking, id: 'APPT-wrong-specialty', time: '11:00', specialty: 'Cardiologist' } },
    ] })).status, 400)
    assert.equal((await request('changes', secretary.cookie, { changes: [
      { collection: 'patients', id: patient.id, before: current, after: { ...current, specialty: 'Anything' } },
    ] })).status, 400)
    assert.equal((await request('changes', secretary.cookie, { changes: [
      { collection: 'patients', id: patient.id, before: current, after: { ...current, type: 'Anything' } },
    ] })).status, 400)
    // An unchanged legacy booking without a specialty remains editable.
    const legacyBooking = { ...booking, id: 'APPT-legacy-specialty', time: '12:00' }
    delete legacyBooking.specialty
    assert.equal((await request('changes', secretary.cookie, { changes: [
      { collection: 'appointments', id: legacyBooking.id, before: null, after: legacyBooking },
    ] })).status, 200)
    assert.equal((await request('changes', secretary.cookie, { changes: [
      { collection: 'appointments', id: legacyBooking.id, before: legacyBooking, after: { ...legacyBooking, notes: 'Updated note' } },
    ] })).status, 200)
    await db.prepare('UPDATE doctors SET specialty = ? WHERE name = ?').run('General Health', booking.doctor)
    const refreshedBooking = (await request('state', secretary.cookie)).body.appointments.find(item => item.id === booking.id)
    assert.equal(refreshedBooking.address, 'Updated Clinic Street')
    assert.equal((await request('changes', secretary.cookie, { changes: [
      { collection: 'appointments', id: booking.id, before: refreshedBooking, after: { ...refreshedBooking, notes: 'Existing specialty retained' } },
    ] })).status, 200)
    // Legacy local-format numbers and the grouped international display identify the same person.
    const legacyPatient = { ...patient, id: 'PTNT-local-phone', name: 'Legacy Mobile', contact: '09194567890', appointments: [] }
    await db.prepare('INSERT INTO records (collection, id, data) VALUES (?, ?, ?)').run('patients', legacyPatient.id, JSON.stringify(legacyPatient))
    const duplicate = await request('changes', receptionist.cookie, { changes: [
      { collection: 'patients', id: 'PTNT-local-phone-duplicate', before: null, after: { ...legacyPatient, id: 'PTNT-local-phone-duplicate', contact: '+63 919 456 7890' } },
    ] })
    assert.equal(duplicate.status, 409)
    assert.equal(duplicate.body.duplicateOf, legacyPatient.id)

    // Arrival can be handled by reception or the secretary, and undone only
    // before consultation. Both clients use the server's real state snapshots.
    let arrival = (await request('state', secretary.cookie)).body.appointments.find(item => item.id === secondBooking.id)
    const updateAppointment = async (cookie, after) => {
      const result = await request('changes', cookie, { changes: [
        { collection: 'appointments', id: arrival.id, before: arrival, after },
      ] })
      if (result.status === 200) arrival = result.body.appointments.find(item => item.id === arrival.id)
      return result
    }
    assert.equal((await updateAppointment(secretary.cookie, { ...arrival, status: 'In Consultation', visitStatus: 'In Consultation' })).status, 400)
    assert.equal((await updateAppointment(receptionist.cookie, { ...arrival, status: 'Checked-In' })).status, 200)
    assert.equal((await updateAppointment(receptionist.cookie, { ...arrival, status: 'Confirmed' })).status, 200)
    assert.equal((await updateAppointment(secretary.cookie, { ...arrival, status: 'Checked-In' })).status, 200)
    assert.equal((await updateAppointment(receptionist.cookie, { ...arrival, status: 'In Consultation', visitStatus: 'In Consultation' })).status, 403)
    assert.equal((await updateAppointment(secretary.cookie, { ...arrival, status: 'In Consultation', visitStatus: 'In Consultation' })).status, 200)
    assert.equal((await updateAppointment(receptionist.cookie, { ...arrival, status: 'Confirmed' })).status, 400)
    assert.equal((await updateAppointment(secretary.cookie, { ...arrival, status: 'Completed', visitStatus: 'Completed' })).status, 200)
    assert.equal((await updateAppointment(secretary.cookie, { ...arrival, status: 'Confirmed', visitStatus: 'Waiting' })).status, 400)
    const past = (await request('state?minimum=1', receptionist.cookie)).body.patients.find(item => item.id === patient.id)
    assert.equal(past.hasPreviousVisit, true)
    assert.deepEqual(past.visits, [])

    // Saved historical visits also count when clinical details are hidden from reception.
    const historicPatient = { ...patient, id: 'PTNT-historic-visit', name: 'Historical Visit', appointments: [],
      visits: [{ id: 'VISIT-historic', date: '2000-01-01', doctor: 'Dr. Cruz', type: 'Follow-up' }] }
    assert.equal((await request('changes', secretary.cookie, { changes: [
      { collection: 'patients', id: historicPatient.id, before: null, after: historicPatient },
    ] })).status, 200)
    const historic = (await request('state?minimum=1', receptionist.cookie)).body.patients.find(item => item.id === historicPatient.id)
    assert.equal(historic.hasPreviousVisit, true)
    assert.deepEqual(historic.visits, [])
    assert.equal((await request('changes', receptionist.cookie, { changes: [
      { collection: 'patients', id: historic.id, before: historic, after: { ...historic, address: 'Updated address' } },
    ] })).status, 200)
    const storedHistoric = JSON.parse((await db.prepare("SELECT data FROM records WHERE collection = 'patients' AND id = ?").get(historic.id)).data)
    assert.equal(storedHistoric.hasPreviousVisit, undefined)
    await db.prepare('UPDATE doctors SET secretary_username = ? WHERE name = ?').run('user2', 'Dr. Santos')
    const otherDoctorBooking = { ...booking, id: 'APPT-history-other-doctor', patientId: historic.id,
      patientName: historic.name, doctor: 'Dr. Cruz', specialty: 'General Health', time: '14:00' }
    assert.equal((await request('changes', secretary.cookie, { changes: [
      { collection: 'appointments', id: otherDoctorBooking.id, before: null, after: otherDoctorBooking },
    ] })).status, 200)
    const restricted = (await request('state?minimum=1', secretary.cookie)).body.patients.find(item => item.id === historic.id)
    assert.deepEqual(restricted.visits, [])
    assert.equal(restricted.hasPreviousVisit, true)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await db.close()
    if (path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(directory, { recursive: true, force: true })
  }
})
