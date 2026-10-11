const express = require('express')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { isDeepStrictEqual } = require('node:util')
require('dotenv').config()
const { openStorage } = require('./storage')
const { createSecurity, hashPassword, verifyPassword, installProtection, production } = require('./security')
const { listAudit, AuditQueryError } = require('./audit')

async function createApp({ seedDemo = false } = {}) {
  const app = express()
  if (production) {
    let origin
    try { origin = new URL(process.env.MEDVAULT_PUBLIC_ORIGIN) } catch { /* Checked below. */ }
    if (!origin || origin.protocol !== 'https:' || origin.origin !== process.env.MEDVAULT_PUBLIC_ORIGIN) {
      throw new Error('Set MEDVAULT_PUBLIC_ORIGIN to the exact HTTPS clinic origin, without a trailing slash.')
    }
  }
  const databasePath = process.env.MEDVAULT_DB_PATH || path.resolve(__dirname, '../data/medvault.sqlite')
  fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 })
  const security = createSecurity(path.dirname(databasePath))
  const db = await openStorage(databasePath, security)
  try {
    return await db.connection(async () => {
      fs.chmodSync(databasePath, 0o600)
      ;(await db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON; PRAGMA busy_timeout = 5000;'))
      ;(await db.exec(`
        CREATE TABLE IF NOT EXISTS records (
          collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
          PRIMARY KEY (collection, id)
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, username TEXT NOT NULL,
          role TEXT NOT NULL, expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS login_attempts (
          username TEXT PRIMARY KEY, count INTEGER NOT NULL, last_attempt BIGINT NOT NULL, locked_until BIGINT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT, occurred_at TEXT NOT NULL,
          username TEXT NOT NULL, role TEXT NOT NULL, collection TEXT NOT NULL,
          record_id TEXT NOT NULL, action TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS staff_accounts (
          username TEXT PRIMARY KEY COLLATE NOCASE,
          password_salt TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL,
          first_name TEXT NOT NULL,
          middle_name TEXT NOT NULL DEFAULT '',
          last_name TEXT NOT NULL,
          address TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          reviewed_at TEXT,
          reviewed_by TEXT
        );
        CREATE TABLE IF NOT EXISTS doctors (
          id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          specialty TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '', secretary_username TEXT NOT NULL DEFAULT '',
          active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS visit_records (
          patient_id TEXT NOT NULL, id TEXT NOT NULL, sort_order INTEGER NOT NULL,
          data TEXT NOT NULL, PRIMARY KEY (patient_id, id)
        );
      `))
      const auditColumns = (await db.prepare('PRAGMA table_info(audit_events)').all()).map((column) => column.name)
      if (!auditColumns.includes('before_data')) (await db.exec('ALTER TABLE audit_events ADD COLUMN before_data TEXT'))
      if (!auditColumns.includes('after_data')) (await db.exec('ALTER TABLE audit_events ADD COLUMN after_data TEXT'))
      if (!auditColumns.includes('prev_hash')) await db.exec("ALTER TABLE audit_events ADD COLUMN prev_hash TEXT NOT NULL DEFAULT ''")
      if (!auditColumns.includes('entry_hash')) await db.exec("ALTER TABLE audit_events ADD COLUMN entry_hash TEXT NOT NULL DEFAULT ''")
      await db.exec(`CREATE INDEX IF NOT EXISTS audit_time ON audit_events (occurred_at, id);
        CREATE INDEX IF NOT EXISTS audit_user_time ON audit_events (username, occurred_at);
        CREATE INDEX IF NOT EXISTS audit_collection_time ON audit_events (collection, occurred_at);`)
      const sessionColumns = (await db.prepare('PRAGMA table_info(sessions)').all()).map(column => column.name)
      if (!sessionColumns.includes('last_seen_at')) await db.exec('ALTER TABLE sessions ADD COLUMN last_seen_at BIGINT NOT NULL DEFAULT 0')
      // Demo fixtures are opt-in for automated tests; normal startup stays empty.
      if (!production && seedDemo && (await db.prepare('SELECT COUNT(*) AS count FROM doctors').get()).count === 0) {
        const insertDoctor = db.prepare('INSERT INTO doctors (id, name, specialty, created_at) VALUES (?, ?, ?, ?)')
        for (const name of ['Dr. Cruz', 'Dr. Santos', 'Dr. Reyes', 'Dr. Rebuyaco']) {
          ;(await insertDoctor.run(crypto.randomUUID(), name, 'General Medicine', new Date().toISOString()))
        }
      }

      if (!production && seedDemo && (await db.prepare('SELECT COUNT(*) AS count FROM records').get()).count === 0) {
        const seed = require('./seed.json')
        const now = new Date()
        const demoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const insert = db.prepare('INSERT INTO records (collection, id, data) VALUES (?, ?, ?)')
        ;(await db.exec('BEGIN IMMEDIATE'))
        try {
          for (const patient of seed.patients) (await insert.run('patients', patient.id, JSON.stringify(patient)))
          for (const appointment of seed.appointments) (await insert.run('appointments', appointment.id, JSON.stringify({ ...appointment, date: demoDate })))
          ;(await db.exec('COMMIT'))
        } catch (error) {
          ;(await db.exec('ROLLBACK'))
          throw error
        }
      }

      // Move older embedded visit arrays into individual SQLite records once.
      const legacyVisits = (await db.prepare("SELECT id, data FROM records WHERE collection = 'patients'").all())
        .filter((row) => Array.isArray(JSON.parse(row.data).visits))
      if (legacyVisits.length) {
        ;(await db.exec('BEGIN IMMEDIATE'))
        try {
          const insertVisit = db.prepare('INSERT INTO visit_records (patient_id, id, sort_order, data) VALUES (?, ?, ?, ?) ON CONFLICT(patient_id, id) DO UPDATE SET sort_order = excluded.sort_order, data = excluded.data')
          const updatePatient = db.prepare("UPDATE records SET data = ? WHERE collection = 'patients' AND id = ?")
          for (const row of legacyVisits) {
            const patient = JSON.parse(row.data)
            for (const [index, visit] of patient.visits.entries()) {
              const saved = { ...visit, id: visit.id || crypto.randomUUID() }
              ;(await insertVisit.run(row.id, saved.id, index, JSON.stringify(saved)))
            }
            delete patient.visits
            patient._visitsInitialized = true
            ;(await updatePatient.run(JSON.stringify(patient), row.id))
          }
          ;(await db.exec('COMMIT'))
        } catch (error) { (await db.exec('ROLLBACK')); throw error }
      }

      app.disable('x-powered-by')
      const log = (event, details = {}) => console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, ...details }))
      app.use(express.json({ limit: '1mb' }))
      app.use('/api', db.middleware)
      installProtection(app, log)
      const recordEvent = (username, role, action, details, collection = 'security', recordId = username) => db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, after_data) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(new Date().toISOString(), username, role, collection, recordId, action, JSON.stringify(details || {}))
      const reject = async (request, response, status, error, extra = {}) => {
        await recordEvent(request.user.username, request.user.role, status === 403 ? 'access-denied' : 'change-rejected',
          { method: request.method, path: request.route?.path || request.path, status })
        return response.status(status).json({ error, ...extra })
      }

      const adminUsername = (process.env.MEDVAULT_ADMIN_USERNAME || 'user3').trim().toLowerCase()
      if (!/^[a-z][a-z0-9._-]{2,31}$/.test(adminUsername)) throw new Error('Invalid bootstrap administrator username.')
      const adminPassword = process.env.MEDVAULT_ADMIN_PASSWORD_FILE ? fs.readFileSync(process.env.MEDVAULT_ADMIN_PASSWORD_FILE, 'utf8').trim()
        : process.env.MEDVAULT_ADMIN_PASSWORD || (production ? '' : 'user3')
      if (production && (adminPassword.length < 12 || Buffer.byteLength(adminPassword, 'utf8') > 72 || !/[A-Za-z]/.test(adminPassword) || !/\d/.test(adminPassword))) throw new Error('Set a strong bootstrap administrator password (12 or more characters, at most 72 UTF-8 bytes, letters and numbers).')
      const accounts = Object.assign(Object.create(null), {
        [adminUsername]: { role: 'Super Admin', hash: await hashPassword(adminPassword) },
      })
      for (const [username, password, role, lastName] of [
        ['user1', process.env.MEDVAULT_RECEPTION_PASSWORD || 'user1', 'Receptionist', 'Receptionist'],
        ['user2', process.env.MEDVAULT_SECRETARY_PASSWORD || 'user2', 'Medical Secretary', 'Secretary'],
      ]) {
        if (production || !seedDemo) continue
        if (username === adminUsername) continue
        if ((await db.prepare('SELECT username FROM staff_accounts WHERE username = ?').get(username))) continue
        const salt = ''
        const hash = await hashPassword(password)
        ;(await db.prepare(`INSERT INTO staff_accounts (username, password_salt, password_hash, role, first_name, middle_name,
          last_name, address, phone, email, status, created_at, reviewed_at, reviewed_by)
          VALUES (?, ?, ?, ?, 'Demo', '', ?, 'Clinic', '0000000', ?, 'approved', ?, ?, 'system')`)
          .run(username, salt, hash, role, lastName, `${username}@medvault.local`, '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z'))
      }
      const dummyHash = await hashPassword(crypto.randomBytes(32).toString('hex'))
      const sessionDurationMs = Number(process.env.MEDVAULT_SESSION_MINUTES || 480) * 60 * 1000
      const idleTimeoutMs = Number(process.env.MEDVAULT_IDLE_MINUTES || 30) * 60 * 1000
      if (!Number.isFinite(sessionDurationMs) || !Number.isFinite(idleTimeoutMs) || sessionDurationMs < 60_000 ||
        sessionDurationMs > 24 * 60 * 60_000 || idleTimeoutMs < 60_000 || idleTimeoutMs > sessionDurationMs) {
        throw new Error('Session limits must be 1–1440 minutes, with idle timeout no greater than absolute timeout.')
      }
      await db.migrateEncryption()
      const integrity = await db.verifyAudit()
      if (!integrity.valid) throw new Error(`Audit integrity check failed at entry ${integrity.failedAt}.`)

      function cookieValue(request, name) {
        const entry = (request.headers.cookie || '').split(';').map((item) => item.trim())
          .find((item) => item.startsWith(`${name}=`))
        return entry ? entry.slice(name.length + 1) : ''
      }

      function sessionCookie(request, token, maxAgeSeconds) {
        const secure = production || request.secure
        return `medvault_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`
      }

      async function authenticate(request, response, next) {
        const token = cookieValue(request, 'medvault_session')
        let claims
        try { claims = security.verify(token) } catch { return response.status(401).json({ error: 'Sign in required or session expired.' }) }
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
        const session = (await db.prepare('SELECT username, role, expires_at, last_seen_at FROM sessions WHERE token_hash = ?').get(tokenHash))
        if (!session || !['Super Admin', 'Receptionist', 'Medical Secretary'].includes(session.role) ||
          session.expires_at <= Date.now() || Date.now() - session.last_seen_at > idleTimeoutMs ||
          claims.sub !== session.username || claims.role !== session.role) {
          await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
          if (session) await recordEvent(session.username, session.role, 'session-expired', { ip: request.ip })
          return response.status(401).json({ error: 'Session expired. Sign in again.' })
        }
        if (!accounts[session.username]) {
          const current = (await db.prepare('SELECT role, status FROM staff_accounts WHERE username = ?').get(session.username))
          if (!current || current.status !== 'approved' || current.role !== session.role) {
            ;(await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash))
            return response.status(401).json({ error: 'Account access changed. Sign in again.' })
          }
        }
        request.user = { username: session.username, role: session.role, tokenHash }
        if (request.get('x-medvault-background') !== '1') await db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(Date.now(), tokenHash)
        next()
      }

      async function adminOnly(request, response, next) {
        if (request.user.role !== 'Super Admin') return reject(request, response, 403, 'Super Admin access required.')
        next()
      }

      function staffAccount(row) {
        return {
          username: row.username, role: row.role, firstName: row.first_name,
          middleName: row.middle_name, lastName: row.last_name, address: row.address,
          phone: row.phone, email: row.email, status: row.status,
          createdAt: row.created_at, reviewedAt: row.reviewed_at, reviewedBy: row.reviewed_by,
        }
      }

      async function readState() {
        const state = { patients: [], appointments: [], schedules: {}, doctors: (await readDoctors()) }
        for (const row of (await db.prepare('SELECT collection, id, data FROM records ORDER BY rowid').all())) {
          if (row.collection === 'schedules') state.schedules[row.id] = JSON.parse(row.data)
          else if (row.collection === 'patients') state.patients.push((await hydratePatient(JSON.parse(row.data))))
          else if (row.collection in state) state[row.collection].push(JSON.parse(row.data))
        }
        return state
      }

      async function hydratePatient(patient) {
        if (!patient._visitsInitialized) return patient
        return { ...patient, visits: (await db.prepare('SELECT data FROM visit_records WHERE patient_id = ? ORDER BY sort_order, id')
          .all(patient.id)).map((row) => JSON.parse(row.data)) }
      }

      function storePatient(patient) {
        const stored = { ...patient }
        if (Array.isArray(stored.visits)) { delete stored.visits; stored._visitsInitialized = true }
        return stored
      }

      async function syncVisits(patient, user, audit) {
        if (!Array.isArray(patient.visits)) return
        const rows = (await db.prepare('SELECT id, data FROM visit_records WHERE patient_id = ?').all(patient.id))
        const previous = new Map(rows.map((row) => [row.id, JSON.parse(row.data)]))
        const nextIds = new Set()
        const upsert = db.prepare('INSERT INTO visit_records (patient_id, id, sort_order, data) VALUES (?, ?, ?, ?) ON CONFLICT(patient_id, id) DO UPDATE SET sort_order = excluded.sort_order, data = excluded.data')
        for (const [index, visit] of patient.visits.entries()) {
          const id = String(visit.id || '')
          if (!id || nextIds.has(id)) throw new Error('Each visit needs a unique ID.')
          nextIds.add(id)
          if (!isDeepStrictEqual(previous.get(id) || null, visit)) (await audit.run(new Date().toISOString(), user.username, user.role,
            'visit_records', `${patient.id}|${id}`, previous.has(id) ? 'update' : 'create',
            previous.has(id) ? JSON.stringify(previous.get(id)) : null, JSON.stringify(visit)))
          ;(await upsert.run(patient.id, id, index, JSON.stringify(visit)))
        }
        const remove = db.prepare('DELETE FROM visit_records WHERE patient_id = ? AND id = ?')
        for (const [id, visit] of previous) if (!nextIds.has(id)) {
          ;(await remove.run(patient.id, id))
          ;(await audit.run(new Date().toISOString(), user.username, user.role, 'visit_records', `${patient.id}|${id}`, 'delete', JSON.stringify(visit), null))
        }
      }

      async function readDoctors() {
        return (await db.prepare('SELECT id, name, specialty, phone, email, secretary_username AS secretaryUsername, active, created_at AS createdAt FROM doctors ORDER BY name').all())
          .map((doctor) => ({ ...doctor, active: Boolean(doctor.active) }))
      }

      function appointmentMinutes(value) {
        const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
        if (!match) return NaN
        let hour = Number(match[1])
        const minute = Number(match[2])
        if (minute > 59 || hour > (match[3] ? 12 : 23) || (match[3] && hour < 1)) return NaN
        if (match[3]) hour = (hour % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0)
        return hour * 60 + minute
      }

      function bookingIssue(appointments, schedules) {
        const booked = appointments.filter((item) => !['Open', 'Cancelled'].includes(item.status))
        const dateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) :
          Number.isNaN(Date.parse(value)) ? '' : new Date(value).toISOString().slice(0, 10)
        for (let index = 0; index < booked.length; index += 1) {
          const item = booked[index]
          const itemMinute = appointmentMinutes(item.time)
          const date = dateOnly(item.date)
          if (!item.doctor || !date || !Number.isFinite(itemMinute) || itemMinute % 30) return { status: 400, error: 'Booked appointments require a doctor, date, and 30-minute time slot.' }
          if (booked.slice(index + 1).some((other) => other.doctor === item.doctor && dateOnly(other.date) === date &&
            Math.abs(appointmentMinutes(other.time) - itemMinute) < 30)) {
            return { status: 409, error: 'This doctor already has an appointment within that 30-minute period.' }
          }
          const schedule = schedules[`${item.doctor}|${date}`]
          if (schedule) {
            const key = `${String(Math.floor(itemMinute / 60)).padStart(2, '0')}:${String(itemMinute % 60).padStart(2, '0')}`
            if (itemMinute < appointmentMinutes(schedule.start) || itemMinute + 30 > appointmentMinutes(schedule.end) || schedule.blocked?.[key]) {
              return { status: 409, error: 'This booking conflicts with the doctor schedule.' }
            }
          }
        }
        return null
      }

      app.get('/api/health', async (_request, response) => response.json({ status: 'ok', message: 'MedVault API is running' }))

      app.post('/api/register', async (request, response) => {
        const username = String(request.body?.username || '').trim().toLowerCase()
        const password = String(request.body?.password || '')
        const confirmPassword = String(request.body?.confirmPassword || '')
        const firstName = String(request.body?.firstName || '').trim()
        const middleName = String(request.body?.middleName || '').trim()
        const lastName = String(request.body?.lastName || '').trim()
        const address = String(request.body?.address || '').trim()
        const phone = String(request.body?.phone || '').trim()
        const email = String(request.body?.email || '').trim().toLowerCase()
        const role = String(request.body?.role || '')
        if (!/^[a-z][a-z0-9._-]{2,31}$/.test(username) || accounts[username] ||
          password.length < 8 || Buffer.byteLength(password, 'utf8') > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password) ||
          password !== confirmPassword || !['Receptionist', 'Medical Secretary'].includes(role) ||
          !firstName || firstName.length > 80 || middleName.length > 80 || !lastName || lastName.length > 80 ||
          !address || address.length > 300 || !/^[+\d][\d\s()-]{6,24}$/.test(phone) ||
          email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return response.status(400).json({ error: 'Check the required details, role, and password requirements.' })
        }
        if ((await db.prepare('SELECT username FROM staff_accounts WHERE username = ? OR email = ?').get(username, email))) {
          return response.status(409).json({ error: 'That username or email is already registered.' })
        }
        const salt = ''
        const hash = await hashPassword(password)
        await db.exec('BEGIN IMMEDIATE')
        try {
          ;(await db.prepare(`INSERT INTO staff_accounts
            (username, password_salt, password_hash, role, first_name, middle_name, last_name, address, phone, email, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
            .run(username, salt, hash, role, firstName, middleName, lastName, address, phone, email, new Date().toISOString()))
          await recordEvent(username, 'anonymous', 'registration', { role, status: 'pending' })
          await db.exec('COMMIT')
          return response.status(201).json({ status: 'pending', message: 'Your request is pending Super Admin approval.' })
        } catch (error) {
          await db.exec('ROLLBACK')
          if (String(error.code).startsWith('SQLITE_CONSTRAINT')) {
            return response.status(409).json({ error: 'That username or email is already registered.' })
          }
          console.error('Unable to create staff request:', error)
          return response.status(500).json({ error: 'Unable to submit your request.' })
        }
      })

      app.post('/api/login', async (request, response) => {
        const username = String(request.body?.username || '').trim().toLowerCase()
        const password = String(request.body?.password || '')
        if (!username || username.length > 32 || Buffer.byteLength(password, 'utf8') > 72) return response.status(400).json({ error: 'Check username and password.' })
        await db.prepare('DELETE FROM login_attempts WHERE last_attempt < ?').run(Date.now() - 24 * 60 * 60_000)
        await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
        const attempts = await db.prepare('SELECT count, last_attempt, locked_until FROM login_attempts WHERE username = ?').get(username)
        const staff = accounts[username] ? null : (await db.prepare('SELECT * FROM staff_accounts WHERE username = ?').get(username))
        const attemptedRole = accounts[username]?.role || staff?.role || 'anonymous'
        if (attempts?.locked_until > Date.now()) {
          await recordEvent(username, attemptedRole, 'login-blocked', { ip: request.ip })
          response.setHeader('Retry-After', String(Math.ceil((attempts.locked_until - Date.now()) / 1000)))
          return response.status(429).json({ error: 'This account is temporarily locked after 5 failed attempts. Try again in 15 minutes.' })
        }
        const matched = await verifyPassword(password, staff?.password_hash || accounts[username]?.hash || dummyHash, staff?.password_salt)
        if ((!accounts[username] && !staff) || !matched) {
          const count = attempts && Date.now() - attempts.last_attempt < 15 * 60_000 ? attempts.count + 1 : 1
          await db.prepare('INSERT INTO login_attempts (username, count, last_attempt, locked_until) VALUES (?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET count = excluded.count, last_attempt = excluded.last_attempt, locked_until = excluded.locked_until')
            .run(username, count, Date.now(), count >= 5 ? Date.now() + 15 * 60_000 : 0)
          await recordEvent(username, attemptedRole, 'login-failed', { ip: request.ip })
          if (count === 5) await recordEvent(username, attemptedRole, 'account-locked', { ip: request.ip })
          log('login_failed', { username, ip: request.ip })
          return response.status(401).json({ error: 'Incorrect username or password.' })
        }
        await db.prepare('DELETE FROM login_attempts WHERE username = ?').run(username)
        if (staff && staff.status !== 'approved') {
          await recordEvent(username, staff.role, 'login-denied', { ip: request.ip, status: staff.status })
          return response.status(403).json({ error: staff.status === 'pending'
            ? 'Your account is awaiting Super Admin approval.'
            : staff.status === 'deactivated' ? 'Your account is deactivated. Contact your administrator.'
              : 'Your registration was declined. Contact your administrator.' })
        }
        const role = accounts[username]?.role || staff.role
        if (!['Super Admin', 'Receptionist', 'Medical Secretary'].includes(role)) return response.status(403).json({ error: 'Account role is not allowed.' })
        if (staff && !/^\$2[aby]\$/.test(staff.password_hash)) await db.prepare('UPDATE staff_accounts SET password_hash = ?, password_salt = ? WHERE username = ?')
          .run(await hashPassword(password), '', username)
        const token = security.sign(username, role, sessionDurationMs / 1000)
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
        await db.exec('BEGIN IMMEDIATE')
        try {
          await db.prepare('INSERT INTO sessions (token_hash, username, role, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
            .run(tokenHash, username, role, Date.now() + sessionDurationMs, Date.now())
          await recordEvent(username, role, 'login', { ip: request.ip })
          await db.exec('COMMIT')
        } catch (error) { await db.exec('ROLLBACK'); throw error }
        request.user = { username, role, tokenHash }
        response.setHeader('Set-Cookie', sessionCookie(request, token, sessionDurationMs / 1000))
        response.json({ role, username })
      })

      app.get('/api/admin/accounts', authenticate, adminOnly, async (_request, response) => {
        response.setHeader('Cache-Control', 'no-store')
        const rows = (await db.prepare('SELECT * FROM staff_accounts ORDER BY created_at DESC').all())
        response.json([...rows.map(staffAccount), { username: adminUsername, role: 'Super Admin',
          firstName: 'Bootstrap', middleName: '', lastName: 'Admin', address: '', phone: '', email: '',
          status: 'approved', createdAt: '', system: true }])
      })

      app.get('/api/admin/overview', authenticate, adminOnly, async (_request, response) => {
        response.setHeader('Cache-Control', 'no-store')
        const accounts = (await db.prepare("SELECT COUNT(*) AS count FROM staff_accounts WHERE status = 'approved' AND role != 'Super Admin'").get()).count
        const pending = (await db.prepare("SELECT COUNT(*) AS count FROM staff_accounts WHERE status = 'pending'").get()).count
        const doctors = (await db.prepare('SELECT COUNT(*) AS count FROM doctors WHERE active = 1').get()).count
        const patients = (await db.prepare("SELECT COUNT(*) AS count FROM records WHERE collection = 'patients'").get()).count
        const appointments = (await db.prepare("SELECT data FROM records WHERE collection = 'appointments'").all())
          .map((row) => JSON.parse(row.data)).filter((item) => !['Open', 'Cancelled'].includes(item.status))
        response.json({ staff: accounts, doctors, patients, appointments: appointments.length, pending,
          bookings: appointments.map((item) => ({ date: item.date, status: item.status })) })
      })

      function accountDetails(body, current = {}) {
        const details = {
          username: String(body.username ?? current.username ?? '').trim().toLowerCase(),
          firstName: String(body.firstName ?? current.first_name ?? '').trim(),
          middleName: String(body.middleName ?? current.middle_name ?? '').trim(),
          lastName: String(body.lastName ?? current.last_name ?? '').trim(),
          address: String(body.address ?? current.address ?? '').trim(),
          phone: String(body.phone ?? current.phone ?? '').trim(),
          email: String(body.email ?? current.email ?? '').trim().toLowerCase(),
          role: String(body.role ?? current.role ?? ''),
          status: String(body.status ?? current.status ?? 'approved'),
        }
        if (!/^[a-z][a-z0-9._-]{2,31}$/.test(details.username) ||
          !['Receptionist', 'Medical Secretary', 'Super Admin'].includes(details.role) ||
          !['approved', 'deactivated'].includes(details.status) ||
          !details.firstName || details.firstName.length > 80 || details.middleName.length > 80 ||
          !details.lastName || details.lastName.length > 80 || !details.address || details.address.length > 300 ||
          !/^[+\d][\d\s()-]{6,24}$/.test(details.phone) ||
          details.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) return null
        return details
      }

      function validPassword(password) {
        return password.length >= 8 && Buffer.byteLength(password, 'utf8') <= 72 && /[A-Za-z]/.test(password) && /\d/.test(password)
      }

      app.post('/api/admin/accounts', authenticate, adminOnly, async (request, response) => {
        const details = accountDetails(request.body || {})
        const password = String(request.body?.password || '')
        if (!details || !validPassword(password) || accounts[details.username]) {
          return reject(request, response, 400, 'Use a password with a letter and number, at least 8 characters and at most 72 UTF-8 bytes.')
        }
        const salt = ''
        const hash = await hashPassword(password)
        const now = new Date().toISOString()
        await db.exec('BEGIN IMMEDIATE')
        try {
          ;(await db.prepare(`INSERT INTO staff_accounts (username, password_salt, password_hash, role, first_name, middle_name,
            last_name, address, phone, email, status, created_at, reviewed_at, reviewed_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(details.username, salt, hash, details.role, details.firstName, details.middleName,
              details.lastName, details.address, details.phone, details.email, details.status, now, now, request.user.username))
          const created = staffAccount((await db.prepare('SELECT * FROM staff_accounts WHERE username = ?').get(details.username)))
          ;(await db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, after_data) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(now, request.user.username, request.user.role, 'staff_accounts', details.username, 'create', JSON.stringify(created)))
          await db.exec('COMMIT')
          return response.status(201).json(created)
        } catch (error) {
          await db.exec('ROLLBACK')
          if (String(error.code).startsWith('SQLITE_CONSTRAINT')) return reject(request, response, 409, 'Username or email is already used.')
          throw error
        }
      })

      app.patch('/api/admin/accounts/:username', authenticate, adminOnly, async (request, response) => {
        const username = String(request.params.username).toLowerCase()
        const previous = (await db.prepare('SELECT * FROM staff_accounts WHERE username = ?').get(username))
        if (!previous) return response.status(404).json({ error: 'Staff account not found.' })
        const details = accountDetails({ ...request.body, username }, previous)
        const password = String(request.body?.password || '')
        if (!details || (password && !validPassword(password))) return reject(request, response, 400, 'Check account details and password.')
        if ((details.status !== 'approved' || details.role !== 'Medical Secretary') &&
          (await db.prepare('SELECT id FROM doctors WHERE secretary_username = ? AND active = 1').get(username))) {
          return reject(request, response, 409, 'Reassign this secretary’s active doctors before changing access.')
        }
        const salt = password ? '' : previous.password_salt
        const hash = password ? await hashPassword(password) : previous.password_hash
        const now = new Date().toISOString()
        ;(await db.exec('BEGIN IMMEDIATE'))
        try {
          ;(await db.prepare(`UPDATE staff_accounts SET password_salt = ?, password_hash = ?, role = ?, first_name = ?, middle_name = ?,
            last_name = ?, address = ?, phone = ?, email = ?, status = ?, reviewed_at = ?, reviewed_by = ? WHERE username = ?`)
            .run(salt, hash, details.role, details.firstName, details.middleName, details.lastName, details.address,
              details.phone, details.email, details.status, now, request.user.username, username))
          if (details.status !== 'approved' || previous.role !== details.role || password) {
            ;(await db.prepare('DELETE FROM sessions WHERE username = ?').run(username))
          }
          const updated = (await db.prepare('SELECT * FROM staff_accounts WHERE username = ?').get(username))
          ;(await db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(now, request.user.username, request.user.role, 'staff_accounts', username, 'update', JSON.stringify(staffAccount(previous)), JSON.stringify(staffAccount(updated))))
          if (password) await recordEvent(request.user.username, request.user.role, 'password-reset', {}, 'staff_accounts', username)
          ;(await db.exec('COMMIT'))
          return response.json(staffAccount(updated))
        } catch (error) {
          ;(await db.exec('ROLLBACK'))
          if (String(error.code).startsWith('SQLITE_CONSTRAINT')) return reject(request, response, 409, 'Email is already used.')
          throw error
        }
      })

      app.get('/api/admin/doctors', authenticate, adminOnly, async (_request, response) => {
        response.setHeader('Cache-Control', 'no-store')
        response.json((await readDoctors()))
      })

      async function doctorDetails(body) {
        const details = {
          name: String(body.name || '').trim(), specialty: String(body.specialty || '').trim(),
          phone: String(body.phone || '').trim(), email: String(body.email || '').trim().toLowerCase(),
          secretaryUsername: String(body.secretaryUsername || '').trim().toLowerCase(),
          active: body.active !== false,
        }
        if (!details.name || details.name.length > 100 || details.specialty.length > 100 ||
          details.phone.length > 30 || details.email.length > 254 ||
          (details.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email))) return null
        if (details.secretaryUsername) {
          const secretary = (await db.prepare('SELECT role, status FROM staff_accounts WHERE username = ?').get(details.secretaryUsername))
          if (!(secretary?.role === 'Medical Secretary' && secretary.status === 'approved')) return null
        }
        return details
      }

      app.post('/api/admin/doctors', authenticate, adminOnly, async (request, response) => {
        const details = (await doctorDetails(request.body || {}))
        if (!details) return reject(request, response, 400, 'Check doctor details and assign an approved medical secretary.')
        const id = crypto.randomUUID()
        await db.exec('BEGIN IMMEDIATE')
        try {
          const now = new Date().toISOString()
          ;(await db.prepare('INSERT INTO doctors (id, name, specialty, phone, email, secretary_username, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(id, details.name, details.specialty, details.phone, details.email, details.secretaryUsername, Number(details.active), now))
          ;(await db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, after_data) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(now, request.user.username, request.user.role, 'doctors', id, 'create', JSON.stringify(details)))
          await db.exec('COMMIT')
          return response.status(201).json((await readDoctors()).find((doctor) => doctor.id === id))
        } catch (error) {
          await db.exec('ROLLBACK')
          if (String(error.code).startsWith('SQLITE_CONSTRAINT')) return reject(request, response, 409, 'A doctor with that name already exists.')
          throw error
        }
      })

      app.patch('/api/admin/doctors/:id', authenticate, adminOnly, async (request, response) => {
        const previous = (await db.prepare('SELECT * FROM doctors WHERE id = ?').get(request.params.id))
        if (!previous) return response.status(404).json({ error: 'Doctor not found.' })
        const details = await doctorDetails({ ...request.body, name: request.body?.name ?? previous.name,
          specialty: request.body?.specialty ?? previous.specialty, phone: request.body?.phone ?? previous.phone,
          email: request.body?.email ?? previous.email, secretaryUsername: request.body?.secretaryUsername ?? previous.secretary_username,
          active: request.body?.active ?? Boolean(previous.active) })
        if (!details) return reject(request, response, 400, 'Check doctor details and assigned secretary.')
        const now = new Date().toISOString()
        ;(await db.exec('BEGIN IMMEDIATE'))
        try {
          ;(await db.prepare('UPDATE doctors SET name = ?, specialty = ?, phone = ?, email = ?, secretary_username = ?, active = ? WHERE id = ?')
            .run(details.name, details.specialty, details.phone, details.email, details.secretaryUsername, Number(details.active), previous.id))
          if (details.name !== previous.name) {
            const rows = (await db.prepare("SELECT collection, id, data FROM records WHERE collection IN ('appointments', 'patients', 'schedules')").all())
            const update = db.prepare('UPDATE records SET id = ?, data = ? WHERE collection = ? AND id = ?')
            for (const row of rows) {
              const data = JSON.parse(row.data)
              let changed = false
              if (data.doctor === previous.name) { data.doctor = details.name; changed = true }
              if (row.collection === 'patients') {
                if (data.consultation?.doctor === previous.name) {
                  data.consultation.doctor = details.name
                  changed = true
                }
                for (const field of ['visits', 'appointments']) for (const item of data[field] || []) {
                  if (item.doctor === previous.name) { item.doctor = details.name; changed = true }
                }
              }
              const nextId = row.collection === 'schedules' && row.id.startsWith(`${previous.name}|`)
                ? `${details.name}${row.id.slice(previous.name.length)}` : row.id
              if (changed || nextId !== row.id) {
                ;(await update.run(nextId, JSON.stringify(data), row.collection, row.id))
                ;(await db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                  .run(now, request.user.username, request.user.role, row.collection, nextId, 'doctor-rename', row.data, JSON.stringify(data)))
              }
            }
            const visits = (await db.prepare('SELECT patient_id, id, data FROM visit_records').all())
            const updateVisit = db.prepare('UPDATE visit_records SET data = ? WHERE patient_id = ? AND id = ?')
            const auditVisit = db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            for (const row of visits) {
              const visit = JSON.parse(row.data)
              if (visit.doctor !== previous.name) continue
              visit.doctor = details.name
              ;(await updateVisit.run(JSON.stringify(visit), row.patient_id, row.id))
              ;(await auditVisit.run(now, request.user.username, request.user.role, 'visit_records', `${row.patient_id}|${row.id}`,
                'doctor-rename', row.data, JSON.stringify(visit)))
            }
          }
          ;(await db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(now, request.user.username, request.user.role, 'doctors', previous.id, 'update', JSON.stringify(previous), JSON.stringify(details)))
          ;(await db.exec('COMMIT'))
          return response.json((await readDoctors()).find((doctor) => doctor.id === previous.id))
        } catch (error) {
          ;(await db.exec('ROLLBACK'))
          if (String(error.code).startsWith('SQLITE_CONSTRAINT')) return reject(request, response, 409, 'Doctor name conflicts with an existing profile or schedule.')
          throw error
        }
      })

      app.post('/api/admin/accounts/:username/decision', authenticate, adminOnly, async (request, response) => {
        const username = String(request.params.username || '').toLowerCase()
        const decision = request.body?.decision
        if (!['approve', 'reject'].includes(decision)) return reject(request, response, 400, 'Choose approve or reject.')
        const row = (await db.prepare('SELECT * FROM staff_accounts WHERE username = ?').get(username))
        if (!row) return response.status(404).json({ error: 'Registration request not found.' })
        if (!['pending', 'rejected'].includes(row.status) || (row.status === 'rejected' && decision === 'reject')) {
          return reject(request, response, 409, 'Review pending registrations here. Use account management to change existing staff access.')
        }
        const status = decision === 'approve' ? 'approved' : 'rejected'
        const reviewedAt = new Date().toISOString()
        ;(await db.exec('BEGIN IMMEDIATE'))
        try {
          ;(await db.prepare('UPDATE staff_accounts SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE username = ?')
            .run(status, reviewedAt, request.user.username, username))
          ;(await db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action) VALUES (?, ?, ?, ?, ?, ?)')
            .run(reviewedAt, request.user.username, request.user.role, 'staff_accounts', username, decision))
          ;(await db.exec('COMMIT'))
          return response.json(staffAccount({ ...row, status, reviewed_at: reviewedAt, reviewed_by: request.user.username }))
        } catch (error) {
          ;(await db.exec('ROLLBACK'))
          console.error('Unable to review staff request:', error)
          return response.status(500).json({ error: 'Unable to review this request.' })
        }
      })

      app.get('/api/session', authenticate, async (request, response) => response.json({ role: request.user.role, username: request.user.username }))

      app.post('/api/activity', authenticate, async (request, response) => {
        const { collection, recordId, section = '' } = request.body || {}
        const modules = request.user.role === 'Super Admin' ? ['dashboard', 'users', 'doctors', 'audit'] :
          request.user.role === 'Medical Secretary' ? ['dashboard', 'patients', 'appointments', 'schedules'] : ['dashboard', 'patients', 'appointments']
        if (collection === 'modules') {
          if (!modules.includes(recordId) || section) return reject(request, response, 403, 'This module is not available to your role.')
        } else {
          if (!['patients', 'appointments'].includes(collection) || request.user.role === 'Super Admin') return reject(request, response, 403, 'Record access is not available to your role.')
          const sections = collection === 'patients' ? ['personal', 'medical', 'appointments', 'vitals', 'medicalHistory', 'consultation', 'visits', 'notes'] : ['apptInfo', 'patientInfo', 'notes']
          if (typeof recordId !== 'string' || recordId.length > 200 || !sections.includes(section)) return reject(request, response, 400, 'Invalid record activity.')
          if (request.user.role === 'Receptionist' && collection === 'patients' && !['personal', 'medical', 'appointments'].includes(section)) return reject(request, response, 403, 'This record section is not available to your role.')
          if (!(await db.prepare('SELECT id FROM records WHERE collection = ? AND id = ?').get(collection, recordId))) return response.status(404).json({ error: 'Record not found.' })
        }
        // Actor and action always come from the validated session, never the browser payload.
        await recordEvent(request.user.username, request.user.role, 'view', { section }, collection, recordId)
        response.json({ ok: true })
      })

      app.post('/api/logout', authenticate, async (request, response) => {
        await db.exec('BEGIN IMMEDIATE')
        try {
          await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(request.user.tokenHash)
          await recordEvent(request.user.username, request.user.role, 'logout', { ip: request.ip })
          await db.exec('COMMIT')
        } catch (error) { await db.exec('ROLLBACK'); throw error }
        response.setHeader('Set-Cookie', sessionCookie(request, '', 0))
        response.json({ ok: true })
      })

      app.get('/api/state', authenticate, async (request, response) => {
        if (!['Receptionist', 'Medical Secretary'].includes(request.user.role)) return reject(request, response, 403, 'Staff records are not part of the admin view.')
        if (request.get('x-medvault-background') !== '1') await recordEvent(request.user.username, request.user.role, 'view', {}, 'all', 'staff-records')
        response.setHeader('Cache-Control', 'no-store')
        response.json((await readState()))
      })

      app.get('/api/admin/security', authenticate, adminOnly, async (_request, response) => {
        response.json({ audit: await db.verifyAudit(), storage: 'SQLite',
          encryption: 'AES-256-GCM', passwordHashing: 'bcrypt (cost 12)', session: 'JWT with server revocation',
          idleMinutes: idleTimeoutMs / 60_000, absoluteMinutes: sessionDurationMs / 60_000 })
      })
      app.get('/api/admin/audit', authenticate, adminOnly, async (request, response) => {
        let result
        try { result = await listAudit(db, request.query) }
        catch (error) {
          if (error instanceof AuditQueryError) return response.status(400).json({ error: error.message })
          throw error
        }
        response.json(result)
      })

      app.post('/api/import-legacy', authenticate, async (request, response) => {
        if (request.user.role !== 'Medical Secretary') return reject(request, response, 403, 'Medical secretary access required.')
        const { patients, appointments, schedules } = request.body || {}
        if (!Array.isArray(patients) || !Array.isArray(appointments) || !schedules || typeof schedules !== 'object' || Array.isArray(schedules) ||
          patients.some((item) => !item || typeof item.id !== 'string') ||
          appointments.some((item) => !item || typeof item.id !== 'string')) {
          return reject(request, response, 400, 'Invalid browser records.')
        }
        if ((await db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE collection IN ('patients', 'appointments', 'schedules', 'all') AND action != 'view'").get()).count > 0) {
          return reject(request, response, 409, 'Shared records have already changed. Browser records were left untouched.')
        }
        const importedPatients = [...patients]
        const patientIds = new Set(importedPatients.map((patient) => patient.id))
        for (const appointment of appointments) {
          if (!appointment.patientId || ['Open', 'Cancelled'].includes(appointment.status)) continue
          if (patientIds.has(appointment.patientId)) continue
          importedPatients.push({
            id: appointment.patientId, name: appointment.patientName || 'Patient to review',
            age: appointment.age || '', sex: appointment.sex || '', birthday: '',
            contact: appointment.contact || '', address: appointment.address || '',
            emergencyName: appointment.emergencyName || '', emergencyContact: appointment.emergencyContact || '',
            status: 'Waiting', vitals: {}, medical: {}, appointments: [],
          })
          patientIds.add(appointment.patientId)
        }
        const importIssue = bookingIssue(appointments, schedules)
        if (importIssue) return response.status(importIssue.status).json({ error: importIssue.error })
        ;(await db.exec('BEGIN IMMEDIATE'))
        try {
          const previousRecords = new Map(await Promise.all((await db.prepare('SELECT collection, id, data FROM records').all()).map(async (row) => [
            `${row.collection}|${row.id}`, row.collection === 'patients' ? (await hydratePatient(JSON.parse(row.data))) : JSON.parse(row.data),
          ])))
          ;(await db.exec('DELETE FROM records'))
          ;(await db.exec('DELETE FROM visit_records'))
          const insert = db.prepare('INSERT INTO records (collection, id, data) VALUES (?, ?, ?)')
          const visitAudit = db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          const recordImport = async (collection, id, data) => {
            ;(await insert.run(collection, id, JSON.stringify(collection === 'patients' ? storePatient(data) : data)))
            const key = `${collection}|${id}`
            const before = previousRecords.get(key)
            ;(await visitAudit.run(new Date().toISOString(), request.user.username, request.user.role, collection, id,
              before ? 'import-update' : 'import-create', before ? JSON.stringify(before) : null, JSON.stringify(data)))
            previousRecords.delete(key)
          }
          for (const patient of importedPatients) {
            ;(await recordImport('patients', patient.id, patient))
            ;(await syncVisits(patient, request.user, visitAudit))
          }
          for (const appointment of appointments) (await recordImport('appointments', appointment.id, appointment))
          for (const [key, schedule] of Object.entries(schedules)) (await recordImport('schedules', key, schedule))
          for (const [key, data] of previousRecords) {
            const separator = key.indexOf('|')
            ;(await visitAudit.run(new Date().toISOString(), request.user.username, request.user.role,
              key.slice(0, separator), key.slice(separator + 1), 'import-delete', JSON.stringify(data), null))
          }
          ;(await db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action) VALUES (?, ?, ?, ?, ?, ?)')
            .run(new Date().toISOString(), request.user.username, request.user.role, 'all', 'legacy-browser', 'import'))
          ;(await db.exec('COMMIT'))
          return response.json((await readState()))
        } catch (error) {
          ;(await db.exec('ROLLBACK'))
          console.error('Unable to import browser records:', error)
          return reject(request, response, 400, 'Unable to import browser records. Check for duplicate IDs.')
        }
      })

      app.post('/api/changes', authenticate, async (request, response) => {
        if (request.user.role === 'Super Admin') return reject(request, response, 403, 'Staff record changes are not available to Super Admin.')
        const changes = request.body?.changes
        if (!Array.isArray(changes) || changes.length < 1 || changes.length > 500) {
          return reject(request, response, 400, 'Expected 1 to 500 record changes.')
        }
        const seen = new Set()
        for (const change of changes) {
          const { collection, id, before, after } = change || {}
          if (request.user.role !== 'Medical Secretary' && collection === 'schedules') return reject(request, response, 403, 'Only a medical secretary may change doctor schedules.')
          if (!['patients', 'appointments', 'schedules'].includes(collection) || typeof id !== 'string' || !id || id.length > 200 ||
            (before !== null && (typeof before !== 'object' || Array.isArray(before))) ||
            (after !== null && (typeof after !== 'object' || Array.isArray(after))) ||
            (after !== null && collection !== 'schedules' && after.id !== id) ||
            (request.user.role !== 'Medical Secretary' && collection === 'schedules')) {
            return reject(request, response, 400, 'Invalid or unauthorized record change.')
          }
          const key = `${collection}|${id}`
          if (seen.has(key)) return reject(request, response, 400, 'Duplicate record change.')
          seen.add(key)
          if (collection === 'patients' && after && (typeof after.name !== 'string' || !after.name.trim() || after.name.length > 160)) {
            return reject(request, response, 400, 'Patient profiles require a name of at most 160 characters.')
          }
          if (collection === 'appointments' && after) {
            const statuses = ['Open', 'Confirmed', 'Checked-In', 'Waiting', 'In Consultation', 'Completed', 'Cancelled']
            if ((!statuses.includes(after.status) && (!before || before.status !== after.status)) ||
              (after.visitStatus !== undefined && !['Waiting', 'In Consultation', 'Completed'].includes(after.visitStatus))) {
              return reject(request, response, 400, 'Choose a valid booking status and visit progress.')
            }
          }
          if (collection === 'schedules' && after) {
            const start = appointmentMinutes(after.start)
            const end = appointmentMinutes(after.end)
            if (!after.doctor || !/^\d{4}-\d{2}-\d{2}$/.test(after.date) || `${after.doctor}|${after.date}` !== id ||
              !Number.isFinite(start) || !Number.isFinite(end) || start % 30 || end % 30 || end - start < 30 ||
              !after.blocked || typeof after.blocked !== 'object' || Array.isArray(after.blocked) ||
              Object.keys(after.blocked).some((slot) => { const minute = appointmentMinutes(slot); return !Number.isFinite(minute) || minute % 30 || minute < start || minute + 30 > end })) {
              return reject(request, response, 400, 'Doctor schedules require a date and valid 30-minute slots.')
            }
          }
          if (collection === 'schedules') {
            const doctorName = after?.doctor || before?.doctor
            const doctor = (await db.prepare('SELECT secretary_username FROM doctors WHERE name = ?').get(doctorName))
            if (doctor?.secretary_username && doctor.secretary_username !== request.user.username) {
              return reject(request, response, 403, 'This doctor’s schedule belongs to another medical secretary.')
            }
          }
          if (request.user.role === 'Receptionist' && collection === 'patients') {
            const clinicalFields = ['vitals', 'medical', 'medicalHistory', 'consultation', 'visits', 'recordNotes']
            const changedClinicalData = clinicalFields.some((field) => before === null
              ? after && after[field] && Object.keys(after[field]).length > 0
              : !isDeepStrictEqual(before[field], after?.[field]))
            if (changedClinicalData) return reject(request, response, 403, 'Only a medical secretary may edit clinical records.')
            if (after && !isDeepStrictEqual(before?.status, after.status) &&
              [before?.status, after.status].some(status => ['In Consultation', 'In Room', 'Done', 'Completed'].includes(status))) {
              return reject(request, response, 403, 'Only a medical secretary may update patient visit progress.')
            }
          }
          if (request.user.role === 'Receptionist' && collection === 'appointments' && after) {
            const progressChanged = before === null
              ? after.visitStatus && after.visitStatus !== 'Waiting'
              : !isDeepStrictEqual(before.visitStatus, after.visitStatus)
            if (progressChanged ||
              (before?.status !== after.status && ['In Consultation', 'Completed'].includes(after.status))) {
              return reject(request, response, 403, 'Only a medical secretary may update visit progress.')
            }
          }
          if (collection === 'appointments' && before && after?.status === 'Open' && before.status !== 'Open') {
            return reject(request, response, 400, 'Cancel the booking and create a separate open slot to retain cancellation history.')
          }
          if (collection === 'appointments' && before?.status === 'Cancelled' && after?.status !== 'Cancelled') {
            return reject(request, response, 400, 'Cancelled bookings remain in history. Create a new booking instead.')
          }
          if (collection === 'appointments' && after && !['Open', 'Cancelled'].includes(after.status) &&
            (!before || before.doctor !== after.doctor || before.date !== after.date || before.time !== after.time)) {
            if (!(await db.prepare('SELECT id FROM doctors WHERE name = ? AND active = 1').get(after.doctor))) {
              return reject(request, response, 400, 'Choose an active doctor for new or rescheduled bookings.')
            }
          }
        }

        ;(await db.exec('BEGIN IMMEDIATE'))
        try {
          const find = db.prepare('SELECT data FROM records WHERE collection = ? AND id = ?')
          const insert = db.prepare('INSERT INTO records (collection, id, data) VALUES (?, ?, ?)')
          const update = db.prepare('UPDATE records SET data = ? WHERE collection = ? AND id = ?')
          const remove = db.prepare('DELETE FROM records WHERE collection = ? AND id = ?')
          const audit = db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          for (const { collection, id, before } of changes) {
            const row = (await find.get(collection, id))
            if (!isDeepStrictEqual(row ? collection === 'patients' ? (await hydratePatient(JSON.parse(row.data))) : JSON.parse(row.data) : null, before)) {
              ;(await db.exec('ROLLBACK'))
              return reject(request, response, 409, 'A record changed in another session. Review the latest data.', { state: await readState() })
            }
          }
          for (const { collection, id, before, after } of changes) {
            if (collection === 'appointments' && after === null && before?.status !== 'Open') {
              ;(await db.exec('ROLLBACK'))
              return reject(request, response, 400, 'Cancel a booking to retain its history; booked appointments cannot be deleted.')
            }
            if (after === null) {
              if (collection === 'patients') {
                for (const visit of before.visits || []) await audit.run(new Date().toISOString(), request.user.username, request.user.role,
                  'visit_records', `${id}|${visit.id}`, 'delete', JSON.stringify(visit), null)
                ;(await db.prepare('DELETE FROM visit_records WHERE patient_id = ?').run(id))
              }
              ;(await remove.run(collection, id))
            } else if (before === null) (await insert.run(collection, id, JSON.stringify(collection === 'patients' ? storePatient(after) : after)))
            else (await update.run(JSON.stringify(collection === 'patients' ? storePatient(after) : after), collection, id))
            if (collection === 'patients' && after) (await syncVisits(after, request.user, audit))
            ;(await audit.run(new Date().toISOString(), request.user.username, request.user.role, collection, id,
              after === null ? 'delete' : before === null ? 'create' : 'update',
              before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after)))
          }
          const patientIds = new Set((await db.prepare("SELECT id FROM records WHERE collection = 'patients'").all()).map((row) => row.id))
          const appointments = (await db.prepare("SELECT data FROM records WHERE collection = 'appointments'").all()).map((row) => JSON.parse(row.data))
          if (appointments.some((appointment) => appointment.status !== 'Open' && appointment.status !== 'Cancelled' &&
            (!appointment.patientId || !patientIds.has(appointment.patientId)))) {
            ;(await db.exec('ROLLBACK'))
            return reject(request, response, 400, 'Every booked appointment must link to a patient profile.')
          }
          const schedules = Object.fromEntries((await db.prepare("SELECT id, data FROM records WHERE collection = 'schedules'").all())
            .map((row) => [row.id, JSON.parse(row.data)]))
          const issue = bookingIssue(appointments, schedules)
          if (issue) {
            ;(await db.exec('ROLLBACK'))
            return reject(request, response, issue.status, issue.error, { state: await readState() })
          }
          ;(await db.exec('COMMIT'))
          return response.json((await readState()))
        } catch (error) {
          ;(await db.exec('ROLLBACK'))
          console.error('Unable to save MedVault records:', error)
          return response.status(500).json({ error: 'Unable to save records.' })
        }
      })

      const clientDist = path.resolve(__dirname, '../../client/dist')
      app.use('/api', (_request, response) => response.status(404).json({ error: 'API endpoint not found.' }))
      app.use((error, request, response, _next) => {
        log('system_error', { path: request.path, code: error.code || 'INTERNAL', message: error.type || 'Request failed' })
        if (response.headersSent) return
        response.status(error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500)
          .json({ error: 'Unable to complete the request.' })
      })
      if (fs.existsSync(clientDist)) {
        app.use(express.static(clientDist))
        app.use((request, response, next) => {
          if (request.method !== 'GET' || request.path.startsWith('/api/')) return next()
          response.sendFile(path.join(clientDist, 'index.html'))
        })
      }

      return { app, db, security }
    })
  } catch (error) {
    await db.close()
    throw error
  }
}

if (require.main === module) createApp().then(({ app, db }) => {
  const server = app.listen(Number(process.env.PORT) || 5000, process.env.HOST || '127.0.0.1', () => console.log('MedVault API is running'))
  const shutdown = () => server.close(() => db.close().then(() => process.exit(0)))
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown)
}).catch(error => { console.error('MedVault startup failed:', error.message); process.exitCode = 1 })

module.exports = { createApp }
