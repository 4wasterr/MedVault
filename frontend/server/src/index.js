const express = require('express')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { isDeepStrictEqual } = require('node:util')
const { DatabaseSync } = require('node:sqlite')
require('dotenv').config()

const app = express()
const port = Number(process.env.PORT) || 5000
const databasePath = process.env.MEDVAULT_DB_PATH || path.resolve(__dirname, '../data/medvault.sqlite')
fs.mkdirSync(path.dirname(databasePath), { recursive: true })
const db = new DatabaseSync(databasePath)
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (collection, id)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, username TEXT NOT NULL,
    role TEXT NOT NULL, expires_at INTEGER NOT NULL
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
`)
const auditColumns = db.prepare('PRAGMA table_info(audit_events)').all().map((column) => column.name)
if (!auditColumns.includes('before_data')) db.exec('ALTER TABLE audit_events ADD COLUMN before_data TEXT')
if (!auditColumns.includes('after_data')) db.exec('ALTER TABLE audit_events ADD COLUMN after_data TEXT')
if (db.prepare('SELECT COUNT(*) AS count FROM doctors').get().count === 0) {
  const insertDoctor = db.prepare('INSERT INTO doctors (id, name, specialty, created_at) VALUES (?, ?, ?, ?)')
  for (const name of ['Dr. Cruz', 'Dr. Santos', 'Dr. Reyes', 'Dr. Rebuyaco']) {
    insertDoctor.run(crypto.randomUUID(), name, 'General Medicine', new Date().toISOString())
  }
}

const seed = require('./seed.json')
if (db.prepare('SELECT COUNT(*) AS count FROM records').get().count === 0) {
  const now = new Date()
  const demoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const insert = db.prepare('INSERT INTO records (collection, id, data) VALUES (?, ?, ?)')
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const patient of seed.patients) insert.run('patients', patient.id, JSON.stringify(patient))
    for (const appointment of seed.appointments) insert.run('appointments', appointment.id, JSON.stringify({ ...appointment, date: demoDate }))
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

// Move older embedded visit arrays into individual SQLite records once.
const legacyVisits = db.prepare("SELECT id, data FROM records WHERE collection = 'patients'").all()
  .filter((row) => Array.isArray(JSON.parse(row.data).visits))
if (legacyVisits.length) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const insertVisit = db.prepare('INSERT OR REPLACE INTO visit_records (patient_id, id, sort_order, data) VALUES (?, ?, ?, ?)')
    const updatePatient = db.prepare("UPDATE records SET data = ? WHERE collection = 'patients' AND id = ?")
    for (const row of legacyVisits) {
      const patient = JSON.parse(row.data)
      patient.visits.forEach((visit, index) => {
        const saved = { ...visit, id: visit.id || crypto.randomUUID() }
        insertVisit.run(row.id, saved.id, index, JSON.stringify(saved))
      })
      delete patient.visits
      patient._visitsInitialized = true
      updatePatient.run(JSON.stringify(patient), row.id)
    }
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

app.disable('x-powered-by')
app.use(express.json({ limit: '4mb' }))

const adminUsername = (process.env.MEDVAULT_ADMIN_USERNAME || 'user3').trim().toLowerCase()
const accounts = {
  [adminUsername]: { password: process.env.MEDVAULT_ADMIN_PASSWORD || 'user3', role: 'Super Admin' },
}
for (const [username, password, role, lastName] of [
  ['user1', process.env.MEDVAULT_RECEPTION_PASSWORD || 'user1', 'Receptionist', 'Receptionist'],
  ['user2', process.env.MEDVAULT_SECRETARY_PASSWORD || 'user2', 'Medical Secretary', 'Secretary'],
]) {
  if (username === adminUsername) continue
  if (db.prepare('SELECT username FROM staff_accounts WHERE username = ?').get(username)) continue
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, Buffer.from(salt, 'hex'), 32).toString('hex')
  db.prepare(`INSERT INTO staff_accounts (username, password_salt, password_hash, role, first_name, middle_name,
    last_name, address, phone, email, status, created_at, reviewed_at, reviewed_by)
    VALUES (?, ?, ?, ?, 'Demo', '', ?, 'Clinic', '0000000', ?, 'approved', ?, ?, 'system')`)
    .run(username, salt, hash, role, lastName, `${username}@medvault.local`, '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')
}
const passwordSalt = crypto.randomBytes(32)
const passwordHashes = Object.fromEntries(Object.entries(accounts).map(([username, account]) => [
  username, crypto.scryptSync(account.password, passwordSalt, 32),
]))
const dummyHash = crypto.scryptSync('invalid-password', passwordSalt, 32)
const sessionDurationMs = 8 * 60 * 60 * 1000
const failedLogins = new Map()

function cookieValue(request, name) {
  const entry = (request.headers.cookie || '').split(';').map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
  return entry ? entry.slice(name.length + 1) : ''
}

function sessionCookie(request, token, maxAgeSeconds) {
  const secure = request.secure || request.get('x-forwarded-proto') === 'https'
  return `medvault_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`
}

function authenticate(request, response, next) {
  const token = cookieValue(request, 'medvault_session')
  if (!/^[0-9a-f]{64}$/.test(token)) return response.status(401).json({ error: 'Sign in required.' })
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const session = db.prepare('SELECT username, role, expires_at FROM sessions WHERE token_hash = ?').get(tokenHash)
  if (!session || session.expires_at < Date.now()) return response.status(401).json({ error: 'Session expired. Sign in again.' })
  if (!accounts[session.username]) {
    const current = db.prepare('SELECT role, status FROM staff_accounts WHERE username = ?').get(session.username)
    if (!current || current.status !== 'approved' || current.role !== session.role) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
      return response.status(401).json({ error: 'Account access changed. Sign in again.' })
    }
  }
  request.user = { username: session.username, role: session.role, tokenHash }
  next()
}

function adminOnly(request, response, next) {
  if (request.user.role !== 'Super Admin') return response.status(403).json({ error: 'Super Admin access required.' })
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

function readState() {
  const state = { patients: [], appointments: [], schedules: {}, doctors: readDoctors() }
  for (const row of db.prepare('SELECT collection, id, data FROM records ORDER BY rowid').all()) {
    if (row.collection === 'schedules') state.schedules[row.id] = JSON.parse(row.data)
    else if (row.collection === 'patients') state.patients.push(hydratePatient(JSON.parse(row.data)))
    else if (row.collection in state) state[row.collection].push(JSON.parse(row.data))
  }
  return state
}

function hydratePatient(patient) {
  if (!patient._visitsInitialized) return patient
  return { ...patient, visits: db.prepare('SELECT data FROM visit_records WHERE patient_id = ? ORDER BY sort_order, id')
    .all(patient.id).map((row) => JSON.parse(row.data)) }
}

function storePatient(patient) {
  const stored = { ...patient }
  if (Array.isArray(stored.visits)) { delete stored.visits; stored._visitsInitialized = true }
  return stored
}

function syncVisits(patient, user, audit) {
  if (!Array.isArray(patient.visits)) return
  const rows = db.prepare('SELECT id, data FROM visit_records WHERE patient_id = ?').all(patient.id)
  const previous = new Map(rows.map((row) => [row.id, JSON.parse(row.data)]))
  const nextIds = new Set()
  const upsert = db.prepare('INSERT INTO visit_records (patient_id, id, sort_order, data) VALUES (?, ?, ?, ?) ON CONFLICT(patient_id, id) DO UPDATE SET sort_order = excluded.sort_order, data = excluded.data')
  patient.visits.forEach((visit, index) => {
    const id = String(visit.id || '')
    if (!id || nextIds.has(id)) throw new Error('Each visit needs a unique ID.')
    nextIds.add(id)
    if (!isDeepStrictEqual(previous.get(id) || null, visit)) audit.run(new Date().toISOString(), user.username, user.role,
      'visit_records', `${patient.id}|${id}`, previous.has(id) ? 'update' : 'create',
      previous.has(id) ? JSON.stringify(previous.get(id)) : null, JSON.stringify(visit))
    upsert.run(patient.id, id, index, JSON.stringify(visit))
  })
  const remove = db.prepare('DELETE FROM visit_records WHERE patient_id = ? AND id = ?')
  for (const [id, visit] of previous) if (!nextIds.has(id)) {
    remove.run(patient.id, id)
    audit.run(new Date().toISOString(), user.username, user.role, 'visit_records', `${patient.id}|${id}`, 'delete', JSON.stringify(visit), null)
  }
}

function readDoctors() {
  return db.prepare('SELECT id, name, specialty, phone, email, secretary_username AS secretaryUsername, active, created_at AS createdAt FROM doctors ORDER BY name').all()
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

app.get('/api/health', (_request, response) => response.json({ status: 'ok', message: 'MedVault API is running' }))

app.post('/api/register', (request, response) => {
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
    password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password) ||
    password !== confirmPassword || !['Receptionist', 'Medical Secretary'].includes(role) ||
    !firstName || firstName.length > 80 || middleName.length > 80 || !lastName || lastName.length > 80 ||
    !address || address.length > 300 || !/^[+\d][\d\s()-]{6,24}$/.test(phone) ||
    email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: 'Check the required details, role, and password requirements.' })
  }
  if (db.prepare('SELECT username FROM staff_accounts WHERE username = ? OR email = ?').get(username, email)) {
    return response.status(409).json({ error: 'That username or email is already registered.' })
  }
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, Buffer.from(salt, 'hex'), 32).toString('hex')
  try {
    db.prepare(`INSERT INTO staff_accounts
      (username, password_salt, password_hash, role, first_name, middle_name, last_name, address, phone, email, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
      .run(username, salt, hash, role, firstName, middleName, lastName, address, phone, email, new Date().toISOString())
    return response.status(201).json({ status: 'pending', message: 'Your request is pending Super Admin approval.' })
  } catch (error) {
    if (String(error.code).startsWith('SQLITE_CONSTRAINT')) {
      return response.status(409).json({ error: 'That username or email is already registered.' })
    }
    console.error('Unable to create staff request:', error)
    return response.status(500).json({ error: 'Unable to submit your request.' })
  }
})

app.post('/api/login', (request, response) => {
  const username = String(request.body?.username || '').trim().toLowerCase()
  const password = String(request.body?.password || '')
  const attempts = failedLogins.get(request.ip) || { count: 0, since: Date.now() }
  if (Date.now() - attempts.since > 60_000) { attempts.count = 0; attempts.since = Date.now() }
  if (attempts.count >= 10) return response.status(429).json({ error: 'Too many sign-in attempts. Try again shortly.' })
  const staff = accounts[username] ? null : db.prepare('SELECT * FROM staff_accounts WHERE username = ?').get(username)
  const candidate = crypto.scryptSync(password, staff ? Buffer.from(staff.password_salt, 'hex') : passwordSalt, 32)
  const expected = staff ? Buffer.from(staff.password_hash, 'hex') : passwordHashes[username] || dummyHash
  if ((!accounts[username] && !staff) || !crypto.timingSafeEqual(candidate, expected)) {
    attempts.count += 1
    failedLogins.set(request.ip, attempts)
    return response.status(401).json({ error: 'Incorrect username or password.' })
  }
  failedLogins.delete(request.ip)
  if (staff && staff.status !== 'approved') {
    return response.status(403).json({ error: staff.status === 'pending'
      ? 'Your account is awaiting Super Admin approval.'
      : staff.status === 'deactivated' ? 'Your account is deactivated. Contact your administrator.'
        : 'Your registration was declined. Contact your administrator.' })
  }
  const role = accounts[username]?.role || staff.role
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  db.prepare('INSERT INTO sessions (token_hash, username, role, expires_at) VALUES (?, ?, ?, ?)')
    .run(tokenHash, username, role, Date.now() + sessionDurationMs)
  response.setHeader('Set-Cookie', sessionCookie(request, token, sessionDurationMs / 1000))
  response.json({ role, username })
})

app.get('/api/admin/accounts', authenticate, adminOnly, (_request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  const rows = db.prepare('SELECT * FROM staff_accounts ORDER BY created_at DESC').all()
  response.json([...rows.map(staffAccount), { username: adminUsername, role: 'Super Admin',
    firstName: 'Bootstrap', middleName: '', lastName: 'Admin', address: '', phone: '', email: '',
    status: 'approved', createdAt: '', system: true }])
})

app.get('/api/admin/overview', authenticate, adminOnly, (_request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  const accounts = db.prepare("SELECT COUNT(*) AS count FROM staff_accounts WHERE status = 'approved' AND role != 'Super Admin'").get().count
  const pending = db.prepare("SELECT COUNT(*) AS count FROM staff_accounts WHERE status = 'pending'").get().count
  const doctors = db.prepare('SELECT COUNT(*) AS count FROM doctors WHERE active = 1').get().count
  const patients = db.prepare("SELECT COUNT(*) AS count FROM records WHERE collection = 'patients'").get().count
  const appointments = db.prepare("SELECT data FROM records WHERE collection = 'appointments'").all()
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
  return password.length >= 8 && password.length <= 128 && /[A-Za-z]/.test(password) && /\d/.test(password)
}

app.post('/api/admin/accounts', authenticate, adminOnly, (request, response) => {
  const details = accountDetails(request.body || {})
  const password = String(request.body?.password || '')
  if (!details || !validPassword(password) || accounts[details.username]) {
    return response.status(400).json({ error: 'Check the account details and use a password with a letter and number (8–128 characters).' })
  }
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, Buffer.from(salt, 'hex'), 32).toString('hex')
  const now = new Date().toISOString()
  try {
    db.prepare(`INSERT INTO staff_accounts (username, password_salt, password_hash, role, first_name, middle_name,
      last_name, address, phone, email, status, created_at, reviewed_at, reviewed_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(details.username, salt, hash, details.role, details.firstName, details.middleName,
        details.lastName, details.address, details.phone, details.email, details.status, now, now, request.user.username)
    const created = staffAccount(db.prepare('SELECT * FROM staff_accounts WHERE username = ?').get(details.username))
    db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, after_data) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(now, request.user.username, request.user.role, 'staff_accounts', details.username, 'create', JSON.stringify(created))
    return response.status(201).json(created)
  } catch (error) {
    if (String(error.code).startsWith('SQLITE_CONSTRAINT')) return response.status(409).json({ error: 'Username or email is already used.' })
    throw error
  }
})

app.patch('/api/admin/accounts/:username', authenticate, adminOnly, (request, response) => {
  const username = String(request.params.username).toLowerCase()
  const previous = db.prepare('SELECT * FROM staff_accounts WHERE username = ?').get(username)
  if (!previous) return response.status(404).json({ error: 'Staff account not found.' })
  const details = accountDetails({ ...request.body, username }, previous)
  const password = String(request.body?.password || '')
  if (!details || (password && !validPassword(password))) return response.status(400).json({ error: 'Check account details and password.' })
  if ((details.status !== 'approved' || details.role !== 'Medical Secretary') &&
    db.prepare('SELECT id FROM doctors WHERE secretary_username = ? AND active = 1').get(username)) {
    return response.status(409).json({ error: 'Reassign this secretary’s active doctors before changing access.' })
  }
  const salt = password ? crypto.randomBytes(16).toString('hex') : previous.password_salt
  const hash = password ? crypto.scryptSync(password, Buffer.from(salt, 'hex'), 32).toString('hex') : previous.password_hash
  const now = new Date().toISOString()
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(`UPDATE staff_accounts SET password_salt = ?, password_hash = ?, role = ?, first_name = ?, middle_name = ?,
      last_name = ?, address = ?, phone = ?, email = ?, status = ?, reviewed_at = ?, reviewed_by = ? WHERE username = ?`)
      .run(salt, hash, details.role, details.firstName, details.middleName, details.lastName, details.address,
        details.phone, details.email, details.status, now, request.user.username, username)
    if (details.status !== 'approved' || previous.role !== details.role || password) {
      db.prepare('DELETE FROM sessions WHERE username = ?').run(username)
    }
    const updated = db.prepare('SELECT * FROM staff_accounts WHERE username = ?').get(username)
    db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(now, request.user.username, request.user.role, 'staff_accounts', username, 'update', JSON.stringify(staffAccount(previous)), JSON.stringify(staffAccount(updated)))
    db.exec('COMMIT')
    return response.json(staffAccount(updated))
  } catch (error) {
    db.exec('ROLLBACK')
    if (String(error.code).startsWith('SQLITE_CONSTRAINT')) return response.status(409).json({ error: 'Email is already used.' })
    throw error
  }
})

app.get('/api/admin/doctors', authenticate, adminOnly, (_request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  response.json(readDoctors())
})

function doctorDetails(body) {
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
    const secretary = db.prepare('SELECT role, status FROM staff_accounts WHERE username = ?').get(details.secretaryUsername)
    if (!(secretary?.role === 'Medical Secretary' && secretary.status === 'approved')) return null
  }
  return details
}

app.post('/api/admin/doctors', authenticate, adminOnly, (request, response) => {
  const details = doctorDetails(request.body || {})
  if (!details) return response.status(400).json({ error: 'Check doctor details and assign an approved medical secretary.' })
  const id = crypto.randomUUID()
  try {
    const now = new Date().toISOString()
    db.prepare('INSERT INTO doctors (id, name, specialty, phone, email, secretary_username, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, details.name, details.specialty, details.phone, details.email, details.secretaryUsername, Number(details.active), now)
    db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, after_data) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(now, request.user.username, request.user.role, 'doctors', id, 'create', JSON.stringify(details))
    return response.status(201).json(readDoctors().find((doctor) => doctor.id === id))
  } catch (error) {
    if (String(error.code).startsWith('SQLITE_CONSTRAINT')) return response.status(409).json({ error: 'A doctor with that name already exists.' })
    throw error
  }
})

app.patch('/api/admin/doctors/:id', authenticate, adminOnly, (request, response) => {
  const previous = db.prepare('SELECT * FROM doctors WHERE id = ?').get(request.params.id)
  if (!previous) return response.status(404).json({ error: 'Doctor not found.' })
  const details = doctorDetails({ ...request.body, name: request.body?.name ?? previous.name,
    specialty: request.body?.specialty ?? previous.specialty, phone: request.body?.phone ?? previous.phone,
    email: request.body?.email ?? previous.email, secretaryUsername: request.body?.secretaryUsername ?? previous.secretary_username,
    active: request.body?.active ?? Boolean(previous.active) })
  if (!details) return response.status(400).json({ error: 'Check doctor details and assigned secretary.' })
  const now = new Date().toISOString()
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('UPDATE doctors SET name = ?, specialty = ?, phone = ?, email = ?, secretary_username = ?, active = ? WHERE id = ?')
      .run(details.name, details.specialty, details.phone, details.email, details.secretaryUsername, Number(details.active), previous.id)
    if (details.name !== previous.name) {
      const rows = db.prepare("SELECT collection, id, data FROM records WHERE collection IN ('appointments', 'patients', 'schedules')").all()
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
          update.run(nextId, JSON.stringify(data), row.collection, row.id)
          db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(now, request.user.username, request.user.role, row.collection, nextId, 'doctor-rename', row.data, JSON.stringify(data))
        }
      }
      const visits = db.prepare('SELECT patient_id, id, data FROM visit_records').all()
      const updateVisit = db.prepare('UPDATE visit_records SET data = ? WHERE patient_id = ? AND id = ?')
      const auditVisit = db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      for (const row of visits) {
        const visit = JSON.parse(row.data)
        if (visit.doctor !== previous.name) continue
        visit.doctor = details.name
        updateVisit.run(JSON.stringify(visit), row.patient_id, row.id)
        auditVisit.run(now, request.user.username, request.user.role, 'visit_records', `${row.patient_id}|${row.id}`,
          'doctor-rename', row.data, JSON.stringify(visit))
      }
    }
    db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(now, request.user.username, request.user.role, 'doctors', previous.id, 'update', JSON.stringify(previous), JSON.stringify(details))
    db.exec('COMMIT')
    return response.json(readDoctors().find((doctor) => doctor.id === previous.id))
  } catch (error) {
    db.exec('ROLLBACK')
    if (String(error.code).startsWith('SQLITE_CONSTRAINT')) return response.status(409).json({ error: 'Doctor name conflicts with an existing profile or schedule.' })
    throw error
  }
})

app.post('/api/admin/accounts/:username/decision', authenticate, adminOnly, (request, response) => {
  const username = String(request.params.username || '').toLowerCase()
  const decision = request.body?.decision
  if (!['approve', 'reject'].includes(decision)) return response.status(400).json({ error: 'Choose approve or reject.' })
  const row = db.prepare('SELECT * FROM staff_accounts WHERE username = ?').get(username)
  if (!row) return response.status(404).json({ error: 'Registration request not found.' })
  if (row.status === 'approved' || (row.status === 'rejected' && decision === 'reject')) {
    return response.status(409).json({ error: 'This request has already been reviewed.' })
  }
  const status = decision === 'approve' ? 'approved' : 'rejected'
  const reviewedAt = new Date().toISOString()
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('UPDATE staff_accounts SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE username = ?')
      .run(status, reviewedAt, request.user.username, username)
    db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action) VALUES (?, ?, ?, ?, ?, ?)')
      .run(reviewedAt, request.user.username, request.user.role, 'staff_accounts', username, decision)
    db.exec('COMMIT')
    return response.json(staffAccount({ ...row, status, reviewed_at: reviewedAt, reviewed_by: request.user.username }))
  } catch (error) {
    db.exec('ROLLBACK')
    console.error('Unable to review staff request:', error)
    return response.status(500).json({ error: 'Unable to review this request.' })
  }
})

app.get('/api/session', authenticate, (request, response) => response.json({ role: request.user.role, username: request.user.username }))

app.post('/api/logout', authenticate, (request, response) => {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(request.user.tokenHash)
  response.setHeader('Set-Cookie', sessionCookie(request, '', 0))
  response.json({ ok: true })
})

app.get('/api/state', authenticate, (request, response) => {
  if (request.user.role === 'Super Admin') return response.status(403).json({ error: 'Staff records are not part of the admin view.' })
  response.setHeader('Cache-Control', 'no-store')
  response.json(readState())
})

app.post('/api/import-legacy', authenticate, (request, response) => {
  if (request.user.role !== 'Medical Secretary') return response.status(403).json({ error: 'Medical secretary access required.' })
  const { patients, appointments, schedules } = request.body || {}
  if (!Array.isArray(patients) || !Array.isArray(appointments) || !schedules || typeof schedules !== 'object' || Array.isArray(schedules) ||
    patients.some((item) => !item || typeof item.id !== 'string') ||
    appointments.some((item) => !item || typeof item.id !== 'string')) {
    return response.status(400).json({ error: 'Invalid browser records.' })
  }
  if (db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE collection IN ('patients', 'appointments', 'schedules', 'all')").get().count > 0) {
    return response.status(409).json({ error: 'Shared records have already changed. Browser records were left untouched.' })
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
  db.exec('BEGIN IMMEDIATE')
  try {
    const previousRecords = new Map(db.prepare('SELECT collection, id, data FROM records').all().map((row) => [
      `${row.collection}|${row.id}`, row.collection === 'patients' ? hydratePatient(JSON.parse(row.data)) : JSON.parse(row.data),
    ]))
    db.exec('DELETE FROM records')
    db.exec('DELETE FROM visit_records')
    const insert = db.prepare('INSERT INTO records (collection, id, data) VALUES (?, ?, ?)')
    const visitAudit = db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    const recordImport = (collection, id, data) => {
      insert.run(collection, id, JSON.stringify(collection === 'patients' ? storePatient(data) : data))
      const key = `${collection}|${id}`
      const before = previousRecords.get(key)
      visitAudit.run(new Date().toISOString(), request.user.username, request.user.role, collection, id,
        before ? 'import-update' : 'import-create', before ? JSON.stringify(before) : null, JSON.stringify(data))
      previousRecords.delete(key)
    }
    for (const patient of importedPatients) {
      recordImport('patients', patient.id, patient)
      syncVisits(patient, request.user, visitAudit)
    }
    for (const appointment of appointments) recordImport('appointments', appointment.id, appointment)
    for (const [key, schedule] of Object.entries(schedules)) recordImport('schedules', key, schedule)
    for (const [key, data] of previousRecords) {
      const separator = key.indexOf('|')
      visitAudit.run(new Date().toISOString(), request.user.username, request.user.role,
        key.slice(0, separator), key.slice(separator + 1), 'import-delete', JSON.stringify(data), null)
    }
    db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action) VALUES (?, ?, ?, ?, ?, ?)')
      .run(new Date().toISOString(), request.user.username, request.user.role, 'all', 'legacy-browser', 'import')
    db.exec('COMMIT')
    return response.json(readState())
  } catch (error) {
    db.exec('ROLLBACK')
    console.error('Unable to import browser records:', error)
    return response.status(400).json({ error: 'Unable to import browser records. Check for duplicate IDs.' })
  }
})

app.post('/api/changes', authenticate, (request, response) => {
  if (request.user.role === 'Super Admin') return response.status(403).json({ error: 'Staff record changes are not available to Super Admin.' })
  const changes = request.body?.changes
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > 500) {
    return response.status(400).json({ error: 'Expected 1 to 500 record changes.' })
  }
  const seen = new Set()
  for (const change of changes) {
    const { collection, id, before, after } = change || {}
    if (!['patients', 'appointments', 'schedules'].includes(collection) || typeof id !== 'string' || !id || id.length > 200 ||
      (before !== null && (typeof before !== 'object' || Array.isArray(before))) ||
      (after !== null && (typeof after !== 'object' || Array.isArray(after))) ||
      (after !== null && collection !== 'schedules' && after.id !== id) ||
      (request.user.role !== 'Medical Secretary' && collection === 'schedules')) {
      return response.status(400).json({ error: 'Invalid or unauthorized record change.' })
    }
    const key = `${collection}|${id}`
    if (seen.has(key)) return response.status(400).json({ error: 'Duplicate record change.' })
    seen.add(key)
    if (collection === 'schedules' && after) {
      const start = appointmentMinutes(after.start)
      const end = appointmentMinutes(after.end)
      if (!after.doctor || !/^\d{4}-\d{2}-\d{2}$/.test(after.date) || `${after.doctor}|${after.date}` !== id ||
        !Number.isFinite(start) || !Number.isFinite(end) || start % 30 || end % 30 || end - start < 30 ||
        !after.blocked || typeof after.blocked !== 'object' || Array.isArray(after.blocked) ||
        Object.keys(after.blocked).some((slot) => { const minute = appointmentMinutes(slot); return !Number.isFinite(minute) || minute % 30 || minute < start || minute + 30 > end })) {
        return response.status(400).json({ error: 'Doctor schedules require a date and valid 30-minute slots.' })
      }
    }
    if (collection === 'schedules') {
      const doctorName = after?.doctor || before?.doctor
      const doctor = db.prepare('SELECT secretary_username FROM doctors WHERE name = ?').get(doctorName)
      if (doctor?.secretary_username && doctor.secretary_username !== request.user.username) {
        return response.status(403).json({ error: 'This doctor’s schedule belongs to another medical secretary.' })
      }
    }
    if (request.user.role === 'Receptionist' && collection === 'patients') {
      const clinicalFields = ['vitals', 'medical', 'medicalHistory', 'consultation', 'visits', 'recordNotes']
      const changedClinicalData = clinicalFields.some((field) => before === null
        ? after && after[field] && Object.keys(after[field]).length > 0
        : !isDeepStrictEqual(before[field], after?.[field]))
      if (changedClinicalData) return response.status(403).json({ error: 'Only a medical secretary may edit clinical records.' })
    }
    if (request.user.role === 'Receptionist' && collection === 'appointments' && after) {
      const progressChanged = before === null
        ? after.visitStatus && after.visitStatus !== 'Waiting'
        : !isDeepStrictEqual(before.visitStatus, after.visitStatus)
      if (progressChanged ||
        (before?.status !== after.status && ['In Consultation', 'Completed'].includes(after.status))) {
        return response.status(403).json({ error: 'Only a medical secretary may update visit progress.' })
      }
    }
    if (collection === 'appointments' && before && after?.status === 'Open' && before.status !== 'Open') {
      return response.status(400).json({ error: 'Cancel the booking and create a separate open slot to retain cancellation history.' })
    }
    if (collection === 'appointments' && before?.status === 'Cancelled' && after?.status !== 'Cancelled') {
      return response.status(400).json({ error: 'Cancelled bookings remain in history. Create a new booking instead.' })
    }
    if (collection === 'appointments' && after && !['Open', 'Cancelled'].includes(after.status) &&
      (!before || before.doctor !== after.doctor || before.date !== after.date || before.time !== after.time)) {
      if (!db.prepare('SELECT id FROM doctors WHERE name = ? AND active = 1').get(after.doctor)) {
        return response.status(400).json({ error: 'Choose an active doctor for new or rescheduled bookings.' })
      }
    }
  }

  db.exec('BEGIN IMMEDIATE')
  try {
    const find = db.prepare('SELECT data FROM records WHERE collection = ? AND id = ?')
    const insert = db.prepare('INSERT INTO records (collection, id, data) VALUES (?, ?, ?)')
    const update = db.prepare('UPDATE records SET data = ? WHERE collection = ? AND id = ?')
    const remove = db.prepare('DELETE FROM records WHERE collection = ? AND id = ?')
    const audit = db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    for (const { collection, id, before } of changes) {
      const row = find.get(collection, id)
      if (!isDeepStrictEqual(row ? collection === 'patients' ? hydratePatient(JSON.parse(row.data)) : JSON.parse(row.data) : null, before)) {
        db.exec('ROLLBACK')
        return response.status(409).json({ error: 'A record changed in another session. Review the latest data.', state: readState() })
      }
    }
    for (const { collection, id, before, after } of changes) {
      if (collection === 'appointments' && after === null && before?.status !== 'Open') {
        db.exec('ROLLBACK')
        return response.status(400).json({ error: 'Cancel a booking to retain its history; booked appointments cannot be deleted.' })
      }
      if (after === null) {
        if (collection === 'patients') {
          db.prepare('DELETE FROM visit_records WHERE patient_id = ?').run(id)
        }
        remove.run(collection, id)
      } else if (before === null) insert.run(collection, id, JSON.stringify(collection === 'patients' ? storePatient(after) : after))
      else update.run(JSON.stringify(collection === 'patients' ? storePatient(after) : after), collection, id)
      if (collection === 'patients' && after) syncVisits(after, request.user, audit)
      audit.run(new Date().toISOString(), request.user.username, request.user.role, collection, id,
        after === null ? 'delete' : before === null ? 'create' : 'update',
        before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after))
    }
    const patientIds = new Set(db.prepare("SELECT id FROM records WHERE collection = 'patients'").all().map((row) => row.id))
    const appointments = db.prepare("SELECT data FROM records WHERE collection = 'appointments'").all().map((row) => JSON.parse(row.data))
    if (appointments.some((appointment) => appointment.status !== 'Open' && appointment.status !== 'Cancelled' &&
      (!appointment.patientId || !patientIds.has(appointment.patientId)))) {
      db.exec('ROLLBACK')
      return response.status(400).json({ error: 'Every booked appointment must link to a patient profile.' })
    }
    const schedules = Object.fromEntries(db.prepare("SELECT id, data FROM records WHERE collection = 'schedules'").all()
      .map((row) => [row.id, JSON.parse(row.data)]))
    const issue = bookingIssue(appointments, schedules)
    if (issue) {
      db.exec('ROLLBACK')
      return response.status(issue.status).json({ error: issue.error, state: readState() })
    }
    db.exec('COMMIT')
    return response.json(readState())
  } catch (error) {
    db.exec('ROLLBACK')
    console.error('Unable to save MedVault records:', error)
    return response.status(500).json({ error: 'Unable to save records.' })
  }
})

const clientDist = path.resolve(__dirname, '../../client/dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/')) return next()
    response.sendFile(path.join(clientDist, 'index.html'))
  })
}

if (require.main === module) app.listen(port, () => {
  console.log(`MedVault API listening on http://localhost:${port}`)
})

module.exports = { app, db }
