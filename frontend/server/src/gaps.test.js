process.env.MEDVAULT_TODAY = '2026-10-01'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createApp } = require('./index')
const mfa = require('./mfa')

test('gap fixes: booking rules, MFA, password recovery, deduplication, relational sync, and access control', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medvault-gaps-'))
  const databasePath = path.join(directory, 'records.sqlite')
  process.env.MEDVAULT_DB_PATH = databasePath
  process.env.MEDVAULT_JWT_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  process.env.MEDVAULT_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  process.env.MEDVAULT_ADMIN_USERNAME = 'user3'
  process.env.MEDVAULT_ADMIN_PASSWORD = 'user3'

  const { app, db } = await createApp({ seedDemo: true })
  const server = app.listen(0)
  const port = server.address().port
  const base = `http://127.0.0.1:${port}`

  const csrfResponse = await fetch(`${base}/api/csrf`)
  const csrfCookie = csrfResponse.headers.get('set-cookie').split(';')[0]
  const { csrfToken } = await csrfResponse.json()

  const request = async (route, cookie, body, method = 'POST') => {
    const response = await fetch(`${base}${route.startsWith('/') ? route : `/${route}`}`, {
      method: body === undefined ? 'GET' : method,
      headers: {
        Cookie: [cookie, csrfCookie].filter(Boolean).join('; '),
        'X-CSRF-Token': csrfToken,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return {
      status: response.status,
      body: await response.json().catch(() => ({})),
      cookie: response.headers.get('set-cookie')?.split(';')[0] || '',
    }
  }

  try {
    const adminLogin = await request('/api/login', '', { username: 'user3', password: 'user3' })
    const adminCookie = adminLogin.cookie
    const secLogin = await request('/api/login', '', { username: 'user2', password: 'user2' })
    const secCookie = secLogin.cookie
    const recLogin = await request('/api/login', '', { username: 'user1', password: 'user1' })
    const recCookie = recLogin.cookie
    let currentRecCookie = recCookie

    await t.test('1. Past appointment dates and invalid hours are rejected', async () => {
      // Past date appointment
      const pastAppointment = {
        id: 'APPT-past-1',
        patientId: 'PTNT-001',
        patientName: 'Juan Dela Cruz',
        doctor: 'Dr. Cruz',
        date: '2020-01-01',
        time: '09:00 AM',
        status: 'Confirmed',
        type: 'New Consultation', contact: '+639171234567',
      }
      const pastRes = await request('/api/changes', recCookie, {
        changes: [{ collection: 'appointments', id: pastAppointment.id, before: null, after: pastAppointment }]
      })
      assert.equal(pastRes.status, 400)
      assert.match(pastRes.body.error, /past date/i)

      // Appointment outside default operating hours (08:00–17:00) when no doctor schedule exists
      const earlyAppointment = {
        id: 'APPT-early-1',
        patientId: 'PTNT-001',
        patientName: 'Juan Dela Cruz',
        doctor: 'Dr. Santos',
        date: '2050-05-10',
        time: '07:30 AM',
        status: 'Confirmed',
        type: 'New Consultation', contact: '+639171234567',
      }
      const earlyRes = await request('/api/changes', recCookie, {
        changes: [{ collection: 'appointments', id: earlyAppointment.id, before: null, after: earlyAppointment }]
      })
      assert.equal(earlyRes.status, 409)
      assert.match(earlyRes.body.error, /operating hours/i)

      // Appointment within default operating hours (09:00 AM) succeeds
      const validAppointment = {
        id: 'APPT-valid-1',
        patientId: 'PTNT-001',
        patientName: 'Juan Dela Cruz',
        doctor: 'Dr. Santos',
        date: '2050-05-10',
        time: '09:00 AM',
        status: 'Confirmed',
        type: 'New Consultation', contact: '+639171234567',
      }
      const validRes = await request('/api/changes', recCookie, {
        changes: [{ collection: 'appointments', id: validAppointment.id, before: null, after: validAppointment }]
      })
      assert.equal(validRes.status, 200)
    })

    await t.test('2. Status transitions follow strict state machine rules', async () => {
      const appt = {
        id: 'APPT-state-machine',
        patientId: 'PTNT-001',
        patientName: 'Juan Dela Cruz',
        doctor: 'Dr. Santos',
        date: '2050-05-10',
        time: '10:00 AM',
        status: 'Confirmed',
        type: 'New Consultation', contact: '+639171234567',
      }
      const createRes = await request('/api/changes', recCookie, {
        changes: [{ collection: 'appointments', id: appt.id, before: null, after: appt }]
      })
      assert.equal(createRes.status, 200)

      // Transition to Completed
      const completed = { ...appt, status: 'Completed', visitStatus: 'Completed' }
      const completeRes = await request('/api/changes', secCookie, {
        changes: [{ collection: 'appointments', id: appt.id, before: appt, after: completed }]
      })
      assert.equal(completeRes.status, 200)

      // Revert Completed -> Confirmed must fail
      const revertRes = await request('/api/changes', secCookie, {
        changes: [{ collection: 'appointments', id: appt.id, before: completed, after: { ...completed, status: 'Confirmed' } }]
      })
      assert.equal(revertRes.status, 400)
      assert.match(revertRes.body.error, /transition|cannot return/i)
    })

    await t.test('3. RFC 6238 TOTP MFA setup, verification, and login gate', async () => {
      // Setup MFA for admin
      const setupRes = await request('/api/auth/mfa/setup', adminCookie, {})
      assert.equal(setupRes.status, 200)
      assert.ok(setupRes.body.secret)
      assert.ok(setupRes.body.otpauthUrl)

      const secret = setupRes.body.secret
      const code = mfa.getTotpCode(secret)

      // Verify MFA
      const verifyRes = await request('/api/auth/mfa/verify', adminCookie, { secret, code })
      assert.equal(verifyRes.status, 200)
      assert.equal(verifyRes.body.enabled, true)
      assert.ok(Array.isArray(verifyRes.body.backupCodes))
      assert.equal(verifyRes.body.backupCodes.length, 8)
      const backupCode = verifyRes.body.backupCodes[0]

      // Next login requires MFA
      const mfaLoginGate = await request('/api/login', '', { username: 'user3', password: 'user3' })
      assert.equal(mfaLoginGate.status, 200)
      assert.equal(mfaLoginGate.body.mfaRequired, true)
      assert.ok(mfaLoginGate.body.tempToken)

      // Submit valid TOTP
      const totpCode = mfa.getTotpCode(secret)
      const completeLogin = await request('/api/auth/mfa/login', '', { tempToken: mfaLoginGate.body.tempToken, code: totpCode })
      assert.equal(completeLogin.status, 200)
      assert.equal(completeLogin.body.role, 'Super Admin')
      assert.ok(completeLogin.cookie)

      // Verify backup code works
      const mfaLoginGate2 = await request('/api/login', '', { username: 'user3', password: 'user3' })
      const backupLogin = await request('/api/auth/mfa/login', '', { tempToken: mfaLoginGate2.body.tempToken, code: backupCode })
      assert.equal(backupLogin.status, 200)

      // Backup code is single use (re-use fails)
      const mfaLoginGate3 = await request('/api/login', '', { username: 'user3', password: 'user3' })
      const reuseBackup = await request('/api/auth/mfa/login', '', { tempToken: mfaLoginGate3.body.tempToken, code: backupCode })
      assert.equal(reuseBackup.status, 401)
    })

    await t.test('4. Admin-initiated temporary password reset and forced password change workflow', async () => {
      // A) Self-serve password reset from login screen is disabled
      const forgotRes = await request('/api/auth/forgot-password', '', { email: 'user1@medvault.local' })
      assert.equal(forgotRes.status, 403)
      assert.match(forgotRes.body.error, /self-service password reset is disabled/i)

      // B) Admin logs in and resets user password from management dashboard
      const resetRes = await request('/api/admin/accounts/user1/reset-password', adminCookie, {})
      assert.equal(resetRes.status, 200)
      assert.equal(resetRes.body.success, true)
      assert.equal(resetRes.body.mustChangePassword, true)
      const tempPassword = resetRes.body.temporaryPassword
      assert.ok(tempPassword)
      assert.match(tempPassword, /^TempPass-\d+$/)

      // C) User logs in with temporary credentials
      const tempLogin = await request('/api/login', '', { username: 'user1', password: tempPassword })
      assert.equal(tempLogin.status, 200)
      assert.equal(tempLogin.body.mustChangePassword, true)

      // D) Forced password change: Cannot reuse temporary password
      const samePassRes = await request('/api/auth/force-change-password', '', {
        username: 'user1',
        currentPassword: tempPassword,
        newPassword: tempPassword,
        confirmPassword: tempPassword,
      })
      assert.equal(samePassRes.status, 400)
      assert.match(samePassRes.body.error, /cannot be identical/i)

      // E) Forced password change: Passwords mismatch
      const mismatchRes = await request('/api/auth/force-change-password', '', {
        username: 'user1',
        currentPassword: tempPassword,
        newPassword: 'NewSecurePassword123',
        confirmPassword: 'MismatchPassword999',
      })
      assert.equal(mismatchRes.status, 400)
      assert.match(mismatchRes.body.error, /do not match/i)

      // F) Forced password change: Successful update
      const newPassword = 'NewSecurePassword123'
      const forceChangeRes = await request('/api/auth/force-change-password', '', {
        username: 'user1',
        currentPassword: tempPassword,
        newPassword,
        confirmPassword: newPassword,
      })
      assert.equal(forceChangeRes.status, 200)
      assert.equal(forceChangeRes.body.success, true)
      assert.equal(forceChangeRes.body.role, 'Receptionist')
      assert.ok(forceChangeRes.cookie)

      // G) User can now sign in normally with new permanent password
      const newLogin = await request('/api/login', '', { username: 'user1', password: newPassword })
      assert.equal(newLogin.status, 200)
      assert.equal(newLogin.body.role, 'Receptionist')
      assert.equal(newLogin.body.mustChangePassword, undefined)
      currentRecCookie = newLogin.cookie
    })

    await t.test('5. Duplicate patient detection and merge API', async () => {
      const recLoginUpdated = await request('/api/login', '', { username: 'user1', password: 'NewSecurePassword123' })
      currentRecCookie = recLoginUpdated.cookie
      const patientA = {
        id: 'PTNT-dup-1',
        name: 'Maria Clara Santos', age: '36', emergencyContact: '+639181234567', emergencyRelationship: 'Parent',
        birthday: '1990-05-15',
        contact: '+639171234567',
        status: 'Waiting',
        vitals: {},
        medical: {},
        appointments: [],
      }
      const createARes = await request('/api/changes', currentRecCookie, {
        changes: [{ collection: 'patients', id: patientA.id, before: null, after: patientA }]
      })
      assert.equal(createARes.status, 200)

      // Attempt creating duplicate patient with same normalized name and birthday
      const patientB = {
        id: 'PTNT-dup-2',
        name: 'Maria Clara-Santos', age: '36', emergencyContact: '+639181234567', emergencyRelationship: 'Parent',
        birthday: '1990-05-15',
        contact: '+639179998888',
        status: 'Waiting',
        vitals: {},
        medical: {},
        appointments: [],
      }
      const dupRes = await request('/api/changes', currentRecCookie, {
        changes: [{ collection: 'patients', id: patientB.id, before: null, after: patientB }]
      })
      assert.equal(dupRes.status, 409)
      assert.match(dupRes.body.error, /already exists/i)

      // Bypassed with allowDuplicate: true
      const allowDupRes = await request('/api/changes', currentRecCookie, {
        changes: [{ collection: 'patients', id: patientB.id, before: null, after: { ...patientB, allowDuplicate: true } }]
      })
      assert.equal(allowDupRes.status, 200)

      // Check duplicate detection endpoint
      const dupListRes = await request('/api/patients/duplicates', secCookie, undefined, 'GET')
      assert.equal(dupListRes.status, 200)
      assert.ok(dupListRes.body.duplicates.length > 0)

      // Merge patientB into patientA
      const mergeRes = await request('/api/patients/merge', secCookie, {
        primaryId: patientA.id,
        duplicateId: patientB.id,
      })
      assert.equal(mergeRes.status, 200)

      // patientB should be deleted
      const checkB = await request(`/api/patients/${patientB.id}`, secCookie, undefined, 'GET')
      assert.equal(checkB.status, 404)
    })

    await t.test('6. Relational sync, incremental sync (/api/sync), and paginated access', async () => {
      // Check relational tables exist and contain records from earlier test changes
      const patRelCount = (await db.prepare('SELECT COUNT(*) AS count FROM patients_rel').get()).count
      const apptRelCount = (await db.prepare('SELECT COUNT(*) AS count FROM appointments_rel').get()).count
      assert.ok(patRelCount > 0)
      assert.ok(apptRelCount > 0)

      // Incremental sync with since timestamp
      const syncFull = await request('/api/sync', currentRecCookie, undefined, 'GET')
      assert.equal(syncFull.status, 200)
      assert.ok(syncFull.body.timestamp)

      const syncIncremental = await request(`/api/sync?since=${encodeURIComponent(syncFull.body.timestamp)}`, currentRecCookie, undefined, 'GET')
      assert.equal(syncIncremental.status, 200)
      assert.equal(syncIncremental.body.upToDate, true)

      // Paginated resource endpoints
      const paginatedPatients = await request('/api/patients?page=1&limit=5', currentRecCookie, undefined, 'GET')
      assert.equal(paginatedPatients.status, 200)
      assert.ok(paginatedPatients.body.patients.length <= 5)
      assert.ok(paginatedPatients.body.total > 0)

      // Minimum necessary access: Receptionist querying /api/patients does not see clinical details
      const recPatient = paginatedPatients.body.patients[0]
      assert.deepEqual(recPatient.vitals, {})
      assert.deepEqual(recPatient.medical, {})
      assert.deepEqual(recPatient.visits, [])
    })

  } finally {
    server.close()
    if (fs.existsSync(directory)) {
      try { fs.rmSync(directory, { recursive: true, force: true }) } catch {}
    }
  }
})
