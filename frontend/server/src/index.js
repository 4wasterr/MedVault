const express = require('express')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { isDeepStrictEqual } = require('node:util')
require('dotenv').config()
const { openStorage } = require('./storage')
const { createSecurity, hashPassword, verifyPassword, installProtection, production } = require('./security')
const { listAudit, AuditQueryError } = require('./audit')
const mfa = require('./mfa')
// ===== VALIDATIONS (added) =====
function todayDateString() {
  return process.env.MEDVAULT_TODAY || (process.env.NODE_ENV === 'production' ? new Date().toISOString().slice(0, 10) : '2026-10-01')
}

function normalizeName(name) {
  return text(name).toLowerCase().replace(/[.,'"`]/g, '').replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizePhone(phone) {
  return text(phone).replace(/\D/g, '')
}

function findDuplicatePatient(patient, existingPatients) {
  const normName = normalizeName(patient.name)
  if (!normName) return null
  const normPhone = normalizePhone(patient.contact)
  const bday = parseDate(patient.birthday)?.toISOString().slice(0, 10) || ''

  for (const existing of existingPatients) {
    if (existing.id === patient.id) continue
    const existNormName = normalizeName(existing.name)
    if (existNormName !== normName) continue

    const existPhone = normalizePhone(existing.contact)
    const existBday = parseDate(existing.birthday)?.toISOString().slice(0, 10) || ''

    const bdayMatch = Boolean(bday && existBday && bday === existBday)
    const phoneMatch = Boolean(normPhone.length >= 7 && existPhone.length >= 7 && normPhone === existPhone)

    if (bdayMatch || phoneMatch) {
      return existing
    }
  }
  return null
}

const ALLOWED_PATIENT_FIELDS = new Set([
  'id', 'name', 'age', 'sex', 'birthday', 'contact', 'address',
  'emergencyName', 'emergencyContact', 'status', 'allowDuplicate', '_visitsInitialized',
  'vitals', 'medical', 'medicalHistory', 'consultation', 'visits', 'recordNotes', 'appointments',
  'isRestricted', 'consentStatus', 'encounters', 'documents'
])
const ALLOWED_APPOINTMENT_FIELDS = new Set([
  'id', 'patientId', 'patientName', 'doctor', 'doctorId', 'room', 'date', 'time',
  'type', 'status', 'contact', 'emergencyContact', 'notes', 'visitStatus', 'cancelledAt'
])
const ALLOWED_SCHEDULE_FIELDS = new Set([
  'doctor', 'date', 'start', 'end', 'blocked'
])

function stripUnknownFields(collection, data) {
  if (!data || typeof data !== 'object') return data
  const result = {}
  if (collection === 'patients') {
    for (const key of Object.keys(data)) {
      if (ALLOWED_PATIENT_FIELDS.has(key)) result[key] = data[key]
    }
    return result
  }
  if (collection === 'appointments') {
    for (const key of Object.keys(data)) {
      if (ALLOWED_APPOINTMENT_FIELDS.has(key)) result[key] = data[key]
    }
    return result
  }
  if (collection === 'schedules') {
    for (const key of Object.keys(data)) {
      if (ALLOWED_SCHEDULE_FIELDS.has(key)) result[key] = data[key]
    }
    return result
  }
  return data
}

const VALID_TRANSITIONS = {
  Open: ['Open', 'Confirmed', 'Checked-In', 'Waiting', 'Cancelled'],
  Confirmed: ['Confirmed', 'Checked-In', 'Waiting', 'In Consultation', 'Completed', 'Cancelled'],
  'Checked-In': ['Checked-In', 'Waiting', 'In Consultation', 'Completed', 'Cancelled'],
  Waiting: ['Waiting', 'Checked-In', 'In Consultation', 'Completed', 'Cancelled'],
  'In Consultation': ['In Consultation', 'Completed', 'Cancelled'],
  Completed: ['Completed'],
  Cancelled: ['Cancelled'],
}
const VALID_VISIT_TRANSITIONS = {
  Waiting: ['Waiting', 'In Consultation', 'Completed'],
  'In Consultation': ['In Consultation', 'Completed'],
  Completed: ['Completed'],
}

function filterPatientForRole(patient, user, doctors = []) {
  if (!patient) return patient
  if (user?.role === 'Receptionist') {
    return {
      id: patient.id,
      name: patient.name,
      age: patient.age || '',
      sex: patient.sex || '',
      birthday: patient.birthday || '',
      contact: patient.contact || '',
      address: patient.address || '',
      emergencyName: patient.emergencyName || '',
      emergencyContact: patient.emergencyContact || '',
      status: patient.status || 'Waiting',
      appointments: patient.appointments || [],
      vitals: {},
      medical: {},
      medicalHistory: {},
      consultation: {},
      visits: [],
      recordNotes: [],
    }
  }
  if (user?.role === 'Medical Secretary') {
    const assignedDoctorNames = (doctors || [])
      .filter((d) => d.secretaryUsername && d.secretaryUsername.toLowerCase() === user.username.toLowerCase())
      .map((d) => d.name.toLowerCase())
    if (assignedDoctorNames.length > 0) {
      const hasCare = (patient.appointments || []).some((a) => a.doctor && assignedDoctorNames.includes(a.doctor.toLowerCase())) ||
        (patient.consultation?.doctor && assignedDoctorNames.includes(patient.consultation.doctor.toLowerCase())) ||
        (patient.visits || []).some((v) => v.doctor && assignedDoctorNames.includes(v.doctor.toLowerCase())) ||
        !(patient.appointments || []).some((a) => a.doctor)
      if (!hasCare) {
        return {
          ...patient,
          vitals: {},
          medical: {},
          medicalHistory: {},
          consultation: {},
          visits: [],
          recordNotes: [],
        }
      }
    }
  }
  if (user?.role === 'Doctor') {
    const docName = (user.doctorName || '').toLowerCase()
    const docId = (user.doctorId || '').toLowerCase()
    const hasEmergencyAccess = Boolean(user.emergencyGrants && user.emergencyGrants.includes(patient.id))
    const hasCare = (patient.appointments || []).some((a) => (a.doctor && a.doctor.toLowerCase() === docName) || (a.doctorId && a.doctorId.toLowerCase() === docId)) ||
      (patient.consultation?.doctor && patient.consultation.doctor.toLowerCase() === docName) ||
      (patient.visits || []).some((v) => v.doctor && v.doctor.toLowerCase() === docName)
    if (!hasCare && !hasEmergencyAccess) {
      return null
    }
  }
  return patient
}

function filterSchedulesForRole(schedules, user, doctors = []) {
  if (user?.role === 'Medical Secretary') {
    const assignedDoctorNames = (doctors || [])
      .filter((d) => d.secretaryUsername && d.secretaryUsername.toLowerCase() === user.username.toLowerCase())
      .map((d) => d.name.toLowerCase())
    if (assignedDoctorNames.length > 0) {
      const filtered = {}
      for (const [key, sched] of Object.entries(schedules || {})) {
        const docName = (sched.doctor || key.split('|')[0] || '').toLowerCase()
        const doc = doctors.find((d) => d.name.toLowerCase() === docName)
        if (!doc || !doc.secretaryUsername || assignedDoctorNames.includes(docName)) {
          filtered[key] = sched
        }
      }
      return filtered
    }
  }
  return schedules
}
const PHONE = /^09\d{9}$/
const PERSON_NAME = /^[\p{L}\p{M}]+(?:[\s.'’ -][\p{L}\p{M}]+)*$/u
const SEXES = ['', 'Female', 'Male', 'Other']
const TEXT_LIMIT = 2000

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const text = (value) => (value === undefined || value === null ? '' : String(value)).trim()
const validPatientPhone = (value) => {
  const compact = text(value).replace(/[\s()-]/g, '')
  const local = compact.startsWith('+63') ? `0${compact.slice(3)}` : compact
  return PHONE.test(local)
}

// Accepts 2026-10-15, "Jan 10, 1991", etc. Returns a Date or null.
function parseDate(value) {
  const raw = text(value)
  if (!raw) return null
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw)
  if (Number.isNaN(date.getTime())) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && date.toISOString().slice(0, 10) !== raw) return null // e.g. 2026-02-31
  return date
}

function validTime(value) {
  const match = text(value).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!match) return false
  const hour = Number(match[1])
  return Number(match[2]) <= 59 && (match[3] ? hour >= 1 && hour <= 12 : hour <= 23)
}

const VITAL_RULES = {
  hr: { label: 'Heart rate', min: 20, max: 300 },
  temp: { label: 'Temperature (°C)', min: 30, max: 45 },
  respRate: { label: 'Respiratory rate', min: 4, max: 80 },
  spo2: { label: 'SpO₂', min: 50, max: 100 },
  weight: { label: 'Weight (kg)', min: 0.2, max: 500 },
  height: { label: 'Height (cm)', min: 20, max: 260 },
}

function vitalProblem(key, raw) {
  const value = text(raw)
  if (!value) return null
  if (key === 'bp') {
    const match = value.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/)
    if (!match) return 'Blood pressure must look like 120/80.'
    const [systolic, diastolic] = [Number(match[1]), Number(match[2])]
    if (systolic < 50 || systolic > 260 || diastolic < 30 || diastolic > 160 || diastolic >= systolic) return 'Blood pressure values are out of range.'
    return null
  }
  if (key === 'measuredAt') {
    const date = parseDate(value)
    if (!date) return 'Vitals “measured at” is not a valid date and time.'
    if (date.getTime() > Date.now() + 5 * 60_000) return 'Vitals cannot be measured in the future.'
    return null
  }


  const rule = VITAL_RULES[key]
  if (!rule) return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < rule.min || number > rule.max) return `${rule.label} must be a number between ${rule.min} and ${rule.max}.`
  return null
}

function tooLong(value) {
  if (typeof value === 'string') return value.length > TEXT_LIMIT
  if (Array.isArray(value)) return value.some(tooLong)
  if (value && typeof value === 'object') return Object.values(value).some(tooLong)
  return false
}

// Returns an error message (string) or null when the patient record is acceptable.
function validatePatient(after, before = null) {
  if (!after) return null
  const was = before || {}
  const name = text(after.name)
  if (!same(was.name, after.name) && !PERSON_NAME.test(name)) return 'Patient name may only contain letters, spaces and . \' -'
  if (!same(was.sex, after.sex) && !SEXES.includes(text(after.sex))) return 'Sex must be Female, Male or Other.'
  if (!same(was.age, after.age) && text(after.age) !== '') {
    const age = Number(after.age)
    if (!Number.isInteger(age) || age < 0 || age > 130) return 'Age must be a whole number from 0 to 130.'
  }
  if (!same(was.birthday, after.birthday) && text(after.birthday) !== '') {
    const birthday = parseDate(after.birthday)
    if (!birthday) return 'Birthday is not a valid date.'
    if (birthday.getTime() > Date.now()) return 'Birthday cannot be in the future.'
    if (birthday.getFullYear() < 1900) return 'Birthday cannot be before 1900.'
  }
  if (!same(was.contact, after.contact) && text(after.contact) && !validPatientPhone(after.contact)) return 'Contact number is not a valid phone number.'
  if (!same(was.emergencyContact, after.emergencyContact) && text(after.emergencyContact) && !validPatientPhone(after.emergencyContact)) return 'Emergency contact number is not a valid phone number.'
  if (!same(was.address, after.address) && text(after.address).length > 300) return 'Address must be 300 characters or fewer.'
  if (!same(was.emergencyName, after.emergencyName) && text(after.emergencyName).length > 160) return 'Emergency contact name must be 160 characters or fewer.'
  if (after.vitals && typeof after.vitals === 'object' && !same(was.vitals, after.vitals)) {
    for (const key of Object.keys(after.vitals)) {
      if (same(was.vitals?.[key], after.vitals[key])) continue
      const problem = vitalProblem(key, after.vitals[key])
      if (problem) return problem
    }
  }
  for (const field of ['medical', 'medicalHistory', 'consultation', 'visits', 'recordNotes']) {
    if (!same(was[field], after[field]) && tooLong(after[field])) return `Entries in ${field} must be ${TEXT_LIMIT} characters or fewer.`
  }
  if (Array.isArray(after.visits) && !same(was.visits, after.visits)) {
    for (const visit of after.visits) {
      if (visit && typeof visit === 'object' && text(visit.date) && !parseDate(visit.date)) return 'Each visit needs a valid date.'
    }
  }
  return null
}

// Returns an error message (string) or null. Validates open slots, past dates, and booked details.
function validateAppointment(after, before = null) {
  if (!after) return null
  const was = before || {}
  const todayStr = todayDateString()
  const apptDate = parseDate(after.date)?.toISOString().slice(0, 10)
  const isDateChanging = was.date !== after.date
  const isNewOrRescheduled = before === null || was.status === 'Open' || isDateChanging

  if (after.status === 'Open') {
    if (!text(after.doctor) || text(after.doctor).length > 100) return 'A doctor is required for open slots.'
    if (!parseDate(after.date)) return 'Appointment date is not a valid date.'
    if (!validTime(after.time)) return 'Appointment time is not valid.'
    if (text(after.room).length > 100) return 'Room must be 100 characters or fewer.'
    if (text(after.notes).length > TEXT_LIMIT) return `Notes must be ${TEXT_LIMIT} characters or fewer.`
    if (apptDate && apptDate < todayStr && isNewOrRescheduled) {
      return 'Cannot create open slots for a past date.'
    }
    return null
  }

  if (after.status === 'Cancelled') {
    if (after.date && !parseDate(after.date)) return 'Appointment date is not a valid date.'
    return null
  }

  if (!same(was.patientName, after.patientName) && (!text(after.patientName) || text(after.patientName).length > 160)) return 'Appointment needs a patient name of at most 160 characters.'
  if (!same(was.contact, after.contact) && text(after.contact) && !validPatientPhone(after.contact)) return 'Appointment contact number is not a valid phone number.'
  if (!same(was.emergencyContact, after.emergencyContact) && text(after.emergencyContact) && !validPatientPhone(after.emergencyContact)) return 'Emergency contact number is not a valid phone number.'
  if (!same(was.type, after.type) && (!text(after.type) || text(after.type).length > 100)) return 'Visit type is required (100 characters or fewer).'
  if (!same(was.doctor, after.doctor) && (!text(after.doctor) || text(after.doctor).length > 100)) return 'A doctor is required.'
  if (!same(was.room, after.room) && text(after.room).length > 100) return 'Room must be 100 characters or fewer.'
  if (!same(was.notes, after.notes) && text(after.notes).length > TEXT_LIMIT) return `Notes must be ${TEXT_LIMIT} characters or fewer.`
  if (!same(was.date, after.date) && !parseDate(after.date)) return 'Appointment date is not a valid date.'
  if (!same(was.time, after.time) && !validTime(after.time)) return 'Appointment time is not valid.'

  if (apptDate && apptDate < todayStr && isNewOrRescheduled) {
    return 'Cannot book or reschedule appointments for a past date.'
  }

  return null
}

// Stops a Super Admin from locking themselves out by editing their own access.
function selfLockout(actingUsername, targetUsername, details) {
  return actingUsername === targetUsername && (details.status !== 'approved' || details.role !== 'Super Admin')
}
// ===== END VALIDATIONS =====

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
        CREATE TABLE IF NOT EXISTS admin_mfa (
          username TEXT PRIMARY KEY COLLATE NOCASE,
          mfa_secret TEXT NOT NULL DEFAULT '',
          mfa_enabled INTEGER NOT NULL DEFAULT 0,
          mfa_backup_codes TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS password_resets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL COLLATE NOCASE,
          code_hash TEXT NOT NULL,
          reset_token_hash TEXT,
          expires_at INTEGER NOT NULL,
          used INTEGER NOT NULL DEFAULT 0,
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_resets_email_exp ON password_resets (email, expires_at);
        CREATE TABLE IF NOT EXISTS patients_rel (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          normalized_name TEXT NOT NULL,
          age TEXT NOT NULL DEFAULT '',
          sex TEXT NOT NULL DEFAULT '',
          birthday TEXT NOT NULL DEFAULT '',
          contact TEXT NOT NULL DEFAULT '',
          normalized_phone TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL DEFAULT '',
          emergency_name TEXT NOT NULL DEFAULT '',
          emergency_contact TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'Waiting',
          data TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_patients_norm_name ON patients_rel (normalized_name, birthday);
        CREATE INDEX IF NOT EXISTS idx_patients_norm_phone ON patients_rel (normalized_phone);

        CREATE TABLE IF NOT EXISTS appointments_rel (
          id TEXT PRIMARY KEY,
          patient_id TEXT,
          patient_name TEXT NOT NULL DEFAULT '',
          doctor_name TEXT NOT NULL,
          room TEXT NOT NULL DEFAULT '',
          date TEXT NOT NULL,
          time TEXT NOT NULL,
          time_minutes INTEGER NOT NULL DEFAULT 0,
          type TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'Open',
          visit_status TEXT NOT NULL DEFAULT '',
          contact TEXT NOT NULL DEFAULT '',
          data TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients_rel(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_appointments_rel_doc_date ON appointments_rel (doctor_name, date, time_minutes);
        CREATE INDEX IF NOT EXISTS idx_appointments_rel_patient ON appointments_rel (patient_id);
        CREATE INDEX IF NOT EXISTS idx_appointments_rel_date_status ON appointments_rel (date, status);

        CREATE TABLE IF NOT EXISTS schedules_rel (
          id TEXT PRIMARY KEY,
          doctor_name TEXT NOT NULL,
          date TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          data TEXT NOT NULL,
          UNIQUE (doctor_name, date)
        );

        CREATE TABLE IF NOT EXISTS encounters (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL,
          doctor_id TEXT NOT NULL,
          doctor_name TEXT NOT NULL,
          appointment_id TEXT DEFAULT '',
          encounter_date TEXT NOT NULL,
          subjective TEXT NOT NULL DEFAULT '',
          objective TEXT NOT NULL DEFAULT '',
          vitals_snapshot TEXT NOT NULL DEFAULT '{}',
          assessment TEXT NOT NULL DEFAULT '',
          diagnosis TEXT NOT NULL DEFAULT '',
          treatment_plan TEXT NOT NULL DEFAULT '',
          prescriptions TEXT NOT NULL DEFAULT '[]',
          follow_up_date TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'draft',
          signed_at TEXT,
          signed_by_username TEXT,
          signature_hash TEXT,
          addenda TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients_rel(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters (patient_id, encounter_date);
        CREATE INDEX IF NOT EXISTS idx_encounters_doctor ON encounters (doctor_id, status);
        CREATE INDEX IF NOT EXISTS idx_encounters_appt ON encounters (appointment_id);

        CREATE TABLE IF NOT EXISTS emergency_access_grants (
          id TEXT PRIMARY KEY,
          doctor_username TEXT NOT NULL COLLATE NOCASE,
          doctor_id TEXT NOT NULL,
          patient_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          consent_recorded INTEGER NOT NULL DEFAULT 1,
          granted_at TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_emergency_grants_doc ON emergency_access_grants (doctor_username, patient_id);

        CREATE TABLE IF NOT EXISTS patient_consents (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL,
          consent_type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'granted',
          granted_by TEXT NOT NULL DEFAULT 'Patient',
          notes TEXT NOT NULL DEFAULT '',
          recorded_by TEXT NOT NULL,
          recorded_at TEXT NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients_rel(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_consents_pat ON patient_consents (patient_id);

        CREATE TABLE IF NOT EXISTS patient_documents (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL,
          uploader_username TEXT NOT NULL COLLATE NOCASE,
          uploader_role TEXT NOT NULL,
          doctor_id TEXT NOT NULL DEFAULT '',
          document_type TEXT NOT NULL,
          title TEXT NOT NULL,
          file_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          file_size INTEGER NOT NULL DEFAULT 0,
          content_base64 TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          FOREIGN KEY (patient_id) REFERENCES patients_rel(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_documents_pat ON patient_documents (patient_id);
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
      const staffColumns = (await db.prepare('PRAGMA table_info(staff_accounts)').all()).map((c) => c.name)
      if (!staffColumns.includes('mfa_secret')) await db.exec("ALTER TABLE staff_accounts ADD COLUMN mfa_secret TEXT NOT NULL DEFAULT ''")
      if (!staffColumns.includes('mfa_enabled')) await db.exec('ALTER TABLE staff_accounts ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0')
      if (!staffColumns.includes('mfa_backup_codes')) await db.exec("ALTER TABLE staff_accounts ADD COLUMN mfa_backup_codes TEXT NOT NULL DEFAULT '[]'")
      if (!staffColumns.includes('doctor_id')) await db.exec("ALTER TABLE staff_accounts ADD COLUMN doctor_id TEXT NOT NULL DEFAULT ''")
      const doctorColumns = (await db.prepare('PRAGMA table_info(doctors)').all()).map((c) => c.name)
      if (!doctorColumns.includes('doctor_username')) await db.exec("ALTER TABLE doctors ADD COLUMN doctor_username TEXT NOT NULL DEFAULT '' COLLATE NOCASE")
      // Demo fixtures are opt-in for automated tests; normal startup stays empty.
      if (!production && seedDemo && (await db.prepare('SELECT COUNT(*) AS count FROM doctors').get()).count === 0) {
        const insertDoctor = db.prepare('INSERT INTO doctors (id, name, specialty, doctor_username, created_at) VALUES (?, ?, ?, ?, ?)')
        const demoDocs = [
          [crypto.randomUUID(), 'Dr. Cruz', 'General Medicine', 'user4'],
          [crypto.randomUUID(), 'Dr. Santos', 'Pediatrics', 'user5'],
          [crypto.randomUUID(), 'Dr. Reyes', 'Cardiology', ''],
          [crypto.randomUUID(), 'Dr. Rebuyaco', 'Surgery', ''],
        ]
        for (const [id, name, specialty, doctorUser] of demoDocs) {
          ;(await insertDoctor.run(id, name, specialty, doctorUser, new Date().toISOString()))
        }
      }

      if (!production && seedDemo && (await db.prepare('SELECT COUNT(*) AS count FROM records').get()).count === 0) {
        const seed = require('./seed.json')
        const now = new Date()
        const demoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const insert = db.prepare('INSERT INTO records (collection, id, data) VALUES (?, ?, ?)')
        ;(await db.exec('BEGIN IMMEDIATE'))
        try {
          for (const patient of seed.patients) {
            await insert.run('patients', patient.id, JSON.stringify(patient))
            await syncRelationalPatient(patient)
          }
          for (const appointment of seed.appointments) {
            const seededAppt = { ...appointment, date: demoDate }
            await insert.run('appointments', appointment.id, JSON.stringify(seededAppt))
            await syncRelationalAppointment(seededAppt)
          }
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
      for (const [username, password, role, lastName, doctorMatchName] of [
        ['user1', process.env.MEDVAULT_RECEPTION_PASSWORD || 'user1', 'Receptionist', 'Receptionist', ''],
        ['user2', process.env.MEDVAULT_SECRETARY_PASSWORD || 'user2', 'Medical Secretary', 'Secretary', ''],
        ['user4', process.env.MEDVAULT_DOCTOR_PASSWORD || 'user4', 'Doctor', 'Cruz', 'Dr. Cruz'],
        ['user5', process.env.MEDVAULT_DOCTOR2_PASSWORD || 'user5', 'Doctor', 'Santos', 'Dr. Santos'],
      ]) {
        if (production || !seedDemo) continue
        if (username === adminUsername) continue
        if ((await db.prepare('SELECT username FROM staff_accounts WHERE username = ?').get(username))) continue
        const salt = ''
        const hash = await hashPassword(password)
        let linkedDoctorId = ''
        if (doctorMatchName) {
          const docRow = await db.prepare('SELECT id FROM doctors WHERE name = ?').get(doctorMatchName)
          if (docRow) {
            linkedDoctorId = docRow.id
            await db.prepare('UPDATE doctors SET doctor_username = ? WHERE id = ?').run(username, linkedDoctorId)
          }
        }
        ;(await db.prepare(`INSERT INTO staff_accounts (username, password_salt, password_hash, role, first_name, middle_name,
          last_name, address, phone, email, status, created_at, reviewed_at, reviewed_by, doctor_id)
          VALUES (?, ?, ?, ?, 'Demo', '', ?, 'Clinic', '0000000', ?, 'approved', ?, ?, 'system', ?)`)
          .run(username, salt, hash, role, lastName, `${username}@medvault.local`, '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', linkedDoctorId))
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
        if (!session || !['Super Admin', 'Receptionist', 'Medical Secretary', 'Doctor'].includes(session.role) ||
          session.expires_at <= Date.now() || Date.now() - session.last_seen_at > idleTimeoutMs ||
          claims.sub !== session.username || claims.role !== session.role) {
          await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
          if (session) await recordEvent(session.username, session.role, 'session-expired', { ip: request.ip })
          return response.status(401).json({ error: 'Session expired. Sign in again.' })
        }
        let doctorId = ''
        let doctorName = ''
        if (!accounts[session.username]) {
          const current = (await db.prepare('SELECT role, status, doctor_id FROM staff_accounts WHERE username = ?').get(session.username))
          if (!current || current.status !== 'approved' || current.role !== session.role) {
            ;(await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash))
            return response.status(401).json({ error: 'Account access changed. Sign in again.' })
          }
          if (session.role === 'Doctor') {
            doctorId = current.doctor_id || ''
            if (doctorId) {
              const doc = await db.prepare('SELECT name FROM doctors WHERE id = ?').get(doctorId)
              doctorName = doc?.name || ''
            }
            if (!doctorName) {
              const doc = await db.prepare('SELECT id, name FROM doctors WHERE doctor_username = ? COLLATE NOCASE OR name LIKE ?').get(session.username, `%${session.username}%`)
              if (doc) {
                doctorId = doc.id
                doctorName = doc.name
              }
            }
          }
        }
        request.user = { username: session.username, role: session.role, tokenHash, doctorId, doctorName }
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

      async function syncRelationalPatient(patient) {
        const normName = normalizeName(patient.name)
        const normPhone = normalizePhone(patient.contact)
        const now = new Date().toISOString()
        await db.prepare(`
          INSERT INTO patients_rel (id, name, normalized_name, age, sex, birthday, contact, normalized_phone, address, emergency_name, emergency_contact, status, data, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name, normalized_name = excluded.normalized_name, age = excluded.age, sex = excluded.sex,
            birthday = excluded.birthday, contact = excluded.contact, normalized_phone = excluded.normalized_phone,
            address = excluded.address, emergency_name = excluded.emergency_name, emergency_contact = excluded.emergency_contact,
            status = excluded.status, data = excluded.data, updated_at = excluded.updated_at
        `).run(patient.id, patient.name, normName, patient.age || '', patient.sex || '', patient.birthday || '',
          patient.contact || '', normPhone, patient.address || '', patient.emergencyName || '', patient.emergencyContact || '',
          patient.status || 'Waiting', JSON.stringify(storePatient(patient)), now, now)
      }

      async function syncRelationalAppointment(appointment) {
        const itemMinute = appointmentMinutes(appointment.time) || 0
        const now = new Date().toISOString()
        await db.prepare(`
          INSERT INTO appointments_rel (id, patient_id, patient_name, doctor_name, room, date, time, time_minutes, type, status, visit_status, contact, data, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            patient_id = excluded.patient_id, patient_name = excluded.patient_name, doctor_name = excluded.doctor_name,
            room = excluded.room, date = excluded.date, time = excluded.time, time_minutes = excluded.time_minutes,
            type = excluded.type, status = excluded.status, visit_status = excluded.visit_status, contact = excluded.contact,
            data = excluded.data
        `).run(appointment.id, appointment.patientId || null, appointment.patientName || '', appointment.doctor || '',
          appointment.room || '', appointment.date || '', appointment.time || '', itemMinute, appointment.type || '',
          appointment.status || 'Open', appointment.visitStatus || '', appointment.contact || '', JSON.stringify(appointment), now)
      }

      async function syncRelationalSchedule(key, schedule) {
        await db.prepare(`
          INSERT INTO schedules_rel (id, doctor_name, date, start_time, end_time, data)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(doctor_name, date) DO UPDATE SET
            start_time = excluded.start_time, end_time = excluded.end_time, data = excluded.data
        `).run(key, schedule.doctor || '', schedule.date || '', schedule.start || '', schedule.end || '', JSON.stringify(schedule))
      }

      async function readState(user = null) {
        const doctors = await readDoctors()
        const state = { patients: [], appointments: [], schedules: {}, doctors }
        const rawPatients = []
        const allAppointments = []
        for (const row of (await db.prepare('SELECT collection, id, data FROM records ORDER BY rowid').all())) {
          if (row.collection === 'schedules') state.schedules[row.id] = JSON.parse(row.data)
          else if (row.collection === 'patients') rawPatients.push(JSON.parse(row.data))
          else if (row.collection === 'appointments') {
            const appt = JSON.parse(row.data)
            state.appointments.push(appt)
            allAppointments.push(appt)
          }
        }
        for (const rawPatient of rawPatients) {
          const hydrated = await hydratePatient(rawPatient)
          const patientAppointments = allAppointments
            .filter((a) => a.patientId === rawPatient.id)
            .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.time || '').localeCompare(a.time || ''))
          const fullPatient = { ...hydrated, appointments: patientAppointments }
          state.patients.push(user ? filterPatientForRole(fullPatient, user, doctors) : fullPatient)
        }
        if (user) {
          state.schedules = filterSchedulesForRole(state.schedules, user, doctors)
        }
        return state
      }

      async function hydratePatient(patient) {
        if (!patient._visitsInitialized && !Array.isArray(patient.visits)) return patient
        const visits = (await db.prepare('SELECT data FROM visit_records WHERE patient_id = ? ORDER BY sort_order, id')
          .all(patient.id)).map((row) => JSON.parse(row.data))
        return { ...patient, visits }
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
        const dateOnly = (value) => parseDate(value)?.toISOString().slice(0, 10) || ''
        const doctorKey = (value) => text(value).toLocaleLowerCase()
        const scheduleIndex = new Map(Object.values(schedules).map((schedule) => [
          `${doctorKey(schedule?.doctor)}|${dateOnly(schedule?.date)}`,
          schedule,
        ]))
        const DEFAULT_START_MINUTE = 8 * 60 // 08:00 AM
        const DEFAULT_END_MINUTE = 17 * 60 // 17:00 (5:00 PM)

        for (let index = 0; index < booked.length; index += 1) {
          const item = booked[index]
          const itemMinute = appointmentMinutes(item.time)
          const date = dateOnly(item.date)
          if (!item.doctor || !date || !Number.isFinite(itemMinute) || itemMinute % 30) return { status: 400, error: 'Booked appointments require a doctor, date, and 30-minute time slot.' }
          if (booked.slice(index + 1).some((other) => doctorKey(other.doctor) === doctorKey(item.doctor) && dateOnly(other.date) === date &&
            Math.abs(appointmentMinutes(other.time) - itemMinute) < 30)) {
            return { status: 409, error: 'This doctor already has an appointment within that 30-minute period.' }
          }
          const schedule = scheduleIndex.get(`${doctorKey(item.doctor)}|${date}`)
          const startMinute = schedule ? appointmentMinutes(schedule.start) : DEFAULT_START_MINUTE
          const endMinute = schedule ? appointmentMinutes(schedule.end) : DEFAULT_END_MINUTE
          if (itemMinute < startMinute || itemMinute + 30 > endMinute) {
            return { status: 409, error: 'This booking conflicts with doctor operating hours.' }
          }
          if (schedule) {
            const key = `${String(Math.floor(itemMinute / 60)).padStart(2, '0')}:${String(itemMinute % 60).padStart(2, '0')}`
            if (schedule.blocked?.[key]) {
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

        const mfaRow = accounts[username]
          ? (await db.prepare('SELECT mfa_secret, mfa_enabled FROM admin_mfa WHERE username = ?').get(username))
          : (await db.prepare('SELECT mfa_secret, mfa_enabled FROM staff_accounts WHERE username = ?').get(username))

        if (mfaRow && mfaRow.mfa_enabled && mfaRow.mfa_secret) {
          const tempToken = security.sign(username, role, 300)
          return response.json({ mfaRequired: true, tempToken, username, role, enrolled: true })
        }

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
        response.json({ role, username, mfaEnrolled: Boolean(mfaRow?.mfa_enabled) })
      })

      
      // MFA Authentication Endpoints
      app.post('/api/auth/mfa/login', async (request, response) => {
        const { tempToken, code: mfaCode } = request.body || {}
        if (!tempToken || !mfaCode) return response.status(400).json({ error: 'Verification code and temporary session token required.' })
        let claims
        try { claims = security.verify(tempToken) }
        catch { return response.status(401).json({ error: 'Verification session expired. Sign in again.' }) }
        const username = claims.sub
        const role = claims.role
        const mfaRow = accounts[username]
          ? (await db.prepare('SELECT mfa_secret, mfa_enabled, mfa_backup_codes FROM admin_mfa WHERE username = ?').get(username))
          : (await db.prepare('SELECT mfa_secret, mfa_enabled, mfa_backup_codes FROM staff_accounts WHERE username = ?').get(username))
        if (!mfaRow || !mfaRow.mfa_secret) return response.status(400).json({ error: 'MFA is not configured for this account.' })

        let valid = mfa.verifyTotp(mfaRow.mfa_secret, mfaCode)
        if (!valid && mfaRow.mfa_backup_codes) {
          try {
            const backupCodes = JSON.parse(mfaRow.mfa_backup_codes)
            const codeHash = mfa.hashBackupCode(mfaCode)
            const idx = backupCodes.indexOf(codeHash)
            if (idx !== -1) {
              valid = true
              backupCodes.splice(idx, 1)
              if (accounts[username]) {
                await db.prepare('UPDATE admin_mfa SET mfa_backup_codes = ? WHERE username = ?').run(JSON.stringify(backupCodes), username)
              } else {
                await db.prepare('UPDATE staff_accounts SET mfa_backup_codes = ? WHERE username = ?').run(JSON.stringify(backupCodes), username)
              }
            }
          } catch { /* ignore */ }
        }
        if (!valid) {
          await recordEvent(username, role, 'mfa-failed', { ip: request.ip })
          return response.status(401).json({ error: 'Invalid verification code or backup code.' })
        }

        const token = security.sign(username, role, sessionDurationMs / 1000)
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
        await db.exec('BEGIN IMMEDIATE')
        try {
          await db.prepare('INSERT INTO sessions (token_hash, username, role, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
            .run(tokenHash, username, role, Date.now() + sessionDurationMs, Date.now())
          await recordEvent(username, role, 'login-mfa', { ip: request.ip })
          await db.exec('COMMIT')
        } catch (error) { await db.exec('ROLLBACK'); throw error }
        request.user = { username, role, tokenHash }
        response.setHeader('Set-Cookie', sessionCookie(request, token, sessionDurationMs / 1000))
        response.json({ role, username })
      })

      app.post('/api/auth/mfa/setup', authenticate, async (request, response) => {
        const secret = mfa.generateSecret()
        const otpauthUrl = mfa.getOtpauthUrl(request.user.username, secret)
        response.json({ secret, otpauthUrl })
      })

      app.post('/api/auth/mfa/verify', authenticate, async (request, response) => {
        const { secret, code: mfaCode } = request.body || {}
        if (!secret || !mfaCode) return response.status(400).json({ error: 'Secret and verification code are required.' })
        if (!mfa.verifyTotp(secret, mfaCode)) return response.status(400).json({ error: 'Invalid 6-digit authentication code.' })

        const rawBackupCodes = mfa.generateBackupCodes()
        const hashedBackupCodes = rawBackupCodes.map(mfa.hashBackupCode)
        if (accounts[request.user.username]) {
          await db.prepare(`INSERT INTO admin_mfa (username, mfa_secret, mfa_enabled, mfa_backup_codes)
            VALUES (?, ?, 1, ?) ON CONFLICT(username) DO UPDATE SET mfa_secret = excluded.mfa_secret, mfa_enabled = 1, mfa_backup_codes = excluded.mfa_backup_codes`)
            .run(request.user.username, secret, JSON.stringify(hashedBackupCodes))
        } else {
          await db.prepare('UPDATE staff_accounts SET mfa_secret = ?, mfa_enabled = 1, mfa_backup_codes = ? WHERE username = ?')
            .run(secret, JSON.stringify(hashedBackupCodes), request.user.username)
        }
        await recordEvent(request.user.username, request.user.role, 'mfa-enabled', {})
        response.json({ enabled: true, backupCodes: rawBackupCodes })
      })

      app.get('/api/auth/mfa/status', authenticate, async (request, response) => {
        const row = accounts[request.user.username]
          ? (await db.prepare('SELECT mfa_enabled FROM admin_mfa WHERE username = ?').get(request.user.username))
          : (await db.prepare('SELECT mfa_enabled FROM staff_accounts WHERE username = ?').get(request.user.username))
        response.json({ enabled: Boolean(row?.mfa_enabled) })
      })

      // Password Reset Endpoints
      const resetRequestLimits = new Map()
      function isResetRateLimited(key) {
        const now = Date.now()
        const history = (resetRequestLimits.get(key) || []).filter(t => now - t < 15 * 60 * 1000)
        if (history.length >= 3) return true
        history.push(now)
        resetRequestLimits.set(key, history)
        return false
      }

      app.post('/api/auth/forgot-password', async (request, response) => {
        const email = text(request.body?.email).toLowerCase()
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return response.status(400).json({ error: 'Please enter a valid email address.' })
        }
        const ipKey = `ip:${request.ip}`
        const emailKey = `email:${email}`
        if (isResetRateLimited(ipKey) || isResetRateLimited(emailKey)) {
          return response.status(429).json({ error: 'Too many password reset requests. Please try again in 15 minutes.' })
        }

        const staff = await db.prepare('SELECT username, status FROM staff_accounts WHERE email = ?').get(email)
        if (staff && staff.status === 'approved') {
          const code = String(crypto.randomInt(100000, 999999))
          const codeHash = crypto.createHash('sha256').update(code).digest('hex')
          const expiresAt = Date.now() + 15 * 60 * 1000
          const now = new Date().toISOString()
          await db.prepare('INSERT INTO password_resets (email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?)')
            .run(email, codeHash, expiresAt, now)
          log('password_reset_email_sent', { email, code: production ? undefined : code })
          if (!production) {
            globalThis.__LAST_RESET_CODE__ = { email, code }
          }
        }
        response.json({ message: 'If an account exists with that email, a password reset code has been sent.' })
      })

      app.post('/api/auth/verify-reset-code', async (request, response) => {
        const email = text(request.body?.email).toLowerCase()
        const code = text(request.body?.code).replace(/\s/g, '')
        if (!email || !code) return response.status(400).json({ error: 'Email and verification code are required.' })
        const row = await db.prepare('SELECT id, code_hash, attempts, expires_at FROM password_resets WHERE email = ? AND used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1')
          .get(email, Date.now())
        if (!row) return response.status(400).json({ error: 'Reset code expired or not found. Please request a new code.' })
        if (row.attempts >= 5) {
          return response.status(429).json({ error: 'Too many incorrect attempts. Please request a new reset code.' })
        }
        const codeHash = crypto.createHash('sha256').update(code).digest('hex')
        if (codeHash !== row.code_hash) {
          await db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?').run(row.id)
          return response.status(400).json({ error: 'Invalid verification code.' })
        }
        const resetToken = crypto.randomBytes(32).toString('hex')
        const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex')
        await db.prepare('UPDATE password_resets SET reset_token_hash = ? WHERE id = ?').run(tokenHash, row.id)
        response.json({ resetToken })
      })

      app.post('/api/auth/reset-password', async (request, response) => {
        const email = text(request.body?.email).toLowerCase()
        const resetToken = text(request.body?.resetToken)
        const newPassword = String(request.body?.newPassword || '')
        const confirmPassword = String(request.body?.confirmPassword || '')
        if (!email || !resetToken || !newPassword) return response.status(400).json({ error: 'All fields are required.' })
        if (newPassword !== confirmPassword) return response.status(400).json({ error: 'Passwords do not match.' })
        if (!validPassword(newPassword)) return response.status(400).json({ error: 'Password must be at least 8 characters and contain letters and numbers.' })

        const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex')
        const resetRow = await db.prepare('SELECT id FROM password_resets WHERE email = ? AND reset_token_hash = ? AND used = 0 AND expires_at > ?')
          .get(email, tokenHash, Date.now())
        if (!resetRow) return response.status(400).json({ error: 'Invalid or expired password reset token.' })

        const staff = await db.prepare('SELECT username FROM staff_accounts WHERE email = ?').get(email)
        if (!staff) return response.status(404).json({ error: 'Account not found.' })

        const newHash = await hashPassword(newPassword)
        await db.exec('BEGIN IMMEDIATE')
        try {
          await db.prepare('UPDATE staff_accounts SET password_hash = ?, password_salt = ? WHERE username = ?')
            .run(newHash, '', staff.username)
          await db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(resetRow.id)
          await db.prepare('DELETE FROM sessions WHERE username = ?').run(staff.username)
          await recordEvent(staff.username, 'staff', 'password-reset-self', { email })
          await db.exec('COMMIT')
        } catch (err) {
          await db.exec('ROLLBACK')
          throw err
        }
        response.json({ message: 'Password has been reset successfully. You may now sign in.' })
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
                  if (selfLockout(request.user.username, username, details)) {
          return reject(request, response, 409, 'You cannot deactivate your own account or remove your own Super Admin role.')
        }
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
        if (request.query.minimum === '1' || request.query.minimum === 'true') {
          return response.json((await readState(request.user)))
        }
        if (!['Receptionist', 'Medical Secretary'].includes(request.user.role)) return reject(request, response, 403, 'Staff records are not part of the admin view.')
        if (request.get('x-medvault-background') !== '1') await recordEvent(request.user.username, request.user.role, 'view', {}, 'all', 'staff-records')
        response.setHeader('Cache-Control', 'no-store')
        response.json((await readState()))
      })

      // Incremental Sync Endpoint
      app.get('/api/sync', authenticate, async (request, response) => {
        if (!['Receptionist', 'Medical Secretary'].includes(request.user.role)) return reject(request, response, 403, 'Unauthorized.')
        const since = request.query.since
        const now = new Date().toISOString()
        if (!since || !parseDate(since)) {
          const state = await readState(request.user)
          return response.json({ upToDate: false, full: true, timestamp: now, state })
        }
        const events = await db.prepare("SELECT occurred_at, collection, record_id, action FROM audit_events WHERE occurred_at > ? AND collection IN ('patients', 'appointments', 'schedules', 'doctors') AND action != 'view' ORDER BY id ASC")
          .all(since)
        if (events.length === 0) {
          return response.json({ upToDate: true, timestamp: now })
        }
        const state = await readState(request.user)
        response.json({ upToDate: false, full: false, timestamp: now, state, changesCount: events.length })
      })

      // Paginated and Role-filtered Resource Endpoints
      app.get('/api/patients', authenticate, async (request, response) => {
        if (!['Receptionist', 'Medical Secretary'].includes(request.user.role)) return reject(request, response, 403, 'Unauthorized.')
        const page = Math.max(1, parseInt(request.query.page) || 1)
        const limit = Math.min(100, Math.max(1, parseInt(request.query.limit) || 20))
        const search = text(request.query.search).toLowerCase()

        const state = await readState(request.user)
        let list = state.patients
        if (search) {
          list = list.filter(p => (p.name || '').toLowerCase().includes(search) || (p.contact || '').includes(search))
        }
        const total = list.length
        const totalPages = Math.ceil(total / limit) || 1
        const paginated = list.slice((page - 1) * limit, page * limit)
        response.json({ patients: paginated, total, page, limit, totalPages })
      })

      app.get('/api/patients/duplicates', authenticate, async (request, response) => {
        if (!['Receptionist', 'Medical Secretary'].includes(request.user.role)) return reject(request, response, 403, 'Unauthorized.')
        const patients = (await db.prepare("SELECT data FROM records WHERE collection = 'patients'").all()).map(r => JSON.parse(r.data))
        const duplicates = []
        const seenPairs = new Set()
        for (let i = 0; i < patients.length; i++) {
          for (let j = i + 1; j < patients.length; j++) {
            const p1 = patients[i]
            const p2 = patients[j]
            const pairKey = [p1.id, p2.id].sort().join('|')
            if (seenPairs.has(pairKey)) continue
            const isDup = findDuplicatePatient(p1, [p2])
            if (isDup) {
              seenPairs.add(pairKey)
              duplicates.push({
                primary: p1,
                duplicate: p2,
                reason: 'Matching normalized name and contact/birthday'
              })
            }
          }
        }
        response.json({ duplicates })
      })

      app.post('/api/patients/merge', authenticate, async (request, response) => {
        if (request.user.role !== 'Medical Secretary') return reject(request, response, 403, 'Only Medical Secretary may merge patient records.')
        const { primaryId, duplicateId } = request.body || {}
        if (!primaryId || !duplicateId || primaryId === duplicateId) return reject(request, response, 400, 'Primary and duplicate patient IDs must be different.')
        const primaryRow = await db.prepare("SELECT data FROM records WHERE collection = 'patients' AND id = ?").get(primaryId)
        const duplicateRow = await db.prepare("SELECT data FROM records WHERE collection = 'patients' AND id = ?").get(duplicateId)
        if (!primaryRow || !duplicateRow) return response.status(404).json({ error: 'One or both patient records not found.' })

        const primary = JSON.parse(primaryRow.data)

        await db.exec('BEGIN IMMEDIATE')
        try {
          const apptRows = await db.prepare("SELECT id, data FROM records WHERE collection = 'appointments'").all()
          const updateAppt = db.prepare("UPDATE records SET data = ? WHERE collection = 'appointments' AND id = ?")
          for (const row of apptRows) {
            const appt = JSON.parse(row.data)
            if (appt.patientId === duplicateId) {
              appt.patientId = primaryId
              appt.patientName = primary.name
              await updateAppt.run(JSON.stringify(appt), appt.id)
              await syncRelationalAppointment(appt)
            }
          }

          const visitRows = await db.prepare('SELECT id, data FROM visit_records WHERE patient_id = ?').all(duplicateId)
          const insertVisit = db.prepare('INSERT INTO visit_records (patient_id, id, sort_order, data) VALUES (?, ?, ?, ?) ON CONFLICT(patient_id, id) DO UPDATE SET data = excluded.data')
          for (const [idx, vRow] of visitRows.entries()) {
            await insertVisit.run(primaryId, vRow.id, 1000 + idx, vRow.data)
          }
          await db.prepare('DELETE FROM visit_records WHERE patient_id = ?').run(duplicateId)

          await db.prepare("DELETE FROM records WHERE collection = 'patients' AND id = ?").run(duplicateId)
          await db.prepare('DELETE FROM patients_rel WHERE id = ?').run(duplicateId)

          const now = new Date().toISOString()
          await db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(now, request.user.username, request.user.role, 'patients', primaryId, 'merge', duplicateRow.data, primaryRow.data)

          await db.exec('COMMIT')
          const updated = await hydratePatient(primary)
          return response.json(filterPatientForRole(updated, request.user))
        } catch (err) {
          await db.exec('ROLLBACK')
          throw err
        }
      })

      app.get('/api/patients/:id', authenticate, async (request, response) => {
        if (!['Receptionist', 'Medical Secretary'].includes(request.user.role)) return reject(request, response, 403, 'Unauthorized.')
        const row = await db.prepare("SELECT data FROM records WHERE collection = 'patients' AND id = ?").get(request.params.id)
        if (!row) return response.status(404).json({ error: 'Patient not found.' })
        const patient = JSON.parse(row.data)
        const doctors = await readDoctors()
        const hydrated = await hydratePatient(patient)
        response.json(filterPatientForRole(hydrated, request.user, doctors))
      })

      app.get('/api/appointments', authenticate, async (request, response) => {
        if (!['Receptionist', 'Medical Secretary'].includes(request.user.role)) return reject(request, response, 403, 'Unauthorized.')
        const { date, doctor, status } = request.query
        const state = await readState(request.user)
        let list = state.appointments
        if (date) list = list.filter(a => a.date === date)
        if (doctor && doctor !== 'All') list = list.filter(a => a.doctor === doctor)
        if (status && status !== 'All') list = list.filter(a => a.status === status)
        response.json({ appointments: list, total: list.length })
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

        // Apply strict validation to all imported patients
        for (const patient of importedPatients) {
          const problem = validatePatient(patient)
          if (problem) return reject(request, response, 400, `Patient ${patient.id || ''}: ${problem}`)
        }

        // Apply strict validation to all imported appointments (skipping past-date rejection for historical records)
        for (const appointment of appointments) {
          const problem = validateAppointment(appointment, appointment)
          if (problem) return reject(request, response, 400, `Appointment ${appointment.id || ''}: ${problem}`)
          if (appointment.status !== 'Open' && appointment.status !== 'Cancelled') {
            if (!appointment.patientId || !patientIds.has(appointment.patientId)) {
              return reject(request, response, 400, `Appointment ${appointment.id || ''} links to missing patient profile.`)
            }
          }
        }

        // Apply strict validation to schedules
        for (const [key, schedule] of Object.entries(schedules)) {
          if (!schedule || typeof schedule !== 'object') return reject(request, response, 400, `Invalid schedule for ${key}.`)
          const start = appointmentMinutes(schedule.start)
          const end = appointmentMinutes(schedule.end)
          if (!schedule.doctor || !parseDate(schedule.date) || !/^\d{4}-\d{2}-\d{2}$/.test(schedule.date) ||
            !Number.isFinite(start) || !Number.isFinite(end) || start % 30 || end % 30 || end - start < 30) {
            return reject(request, response, 400, `Schedule for ${key} requires valid start and end times.`)
          }
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
          ;(await db.exec('DELETE FROM patients_rel'))
          ;(await db.exec('DELETE FROM appointments_rel'))
          ;(await db.exec('DELETE FROM schedules_rel'))
          const insert = db.prepare('INSERT INTO records (collection, id, data) VALUES (?, ?, ?)')
          const visitAudit = db.prepare('INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, before_data, after_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          const recordImport = async (collection, id, data) => {
            const clean = stripUnknownFields(collection, data, request.user.role)
            ;(await insert.run(collection, id, JSON.stringify(collection === 'patients' ? storePatient(clean) : clean)))
            if (collection === 'patients') await syncRelationalPatient(clean)
            else if (collection === 'appointments') await syncRelationalAppointment(clean)
            else if (collection === 'schedules') await syncRelationalSchedule(id, clean)
            const key = `${collection}|${id}`
            const before = previousRecords.get(key)
            ;(await visitAudit.run(new Date().toISOString(), request.user.username, request.user.role, collection, id,
              before ? 'import-update' : 'import-create', before ? JSON.stringify(before) : null, JSON.stringify(clean)))
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
          if (collection === 'patients' && after) {
            const problem = validatePatient(after, before)
            if (problem) return reject(request, response, 400, problem)
          }
          if (collection === 'patients' && before === null && after) {
            const existingPatients = (await db.prepare("SELECT data FROM records WHERE collection = 'patients'").all()).map((r) => JSON.parse(r.data))
            const dup = findDuplicatePatient(after, existingPatients)
            if (dup && !after.allowDuplicate) {
              return reject(request, response, 409, 'A patient with this name and birthday or contact already exists.', {
                duplicateOf: dup.id,
                existing: { id: dup.id, name: dup.name, birthday: dup.birthday, contact: dup.contact },
              })
            }
          }
          if (collection === 'appointments' && after && text(after.doctor)) {
            const doctor = await db.prepare('SELECT name FROM doctors WHERE name = ?').get(after.doctor)
            if (doctor) after.doctor = doctor.name
          }
          if (collection === 'appointments' && after) {
            const problem = validateAppointment(after, before)
            if (problem) return reject(request, response, 400, problem)
          }
          if (collection === 'appointments' && after) {
            const statuses = ['Open', 'Confirmed', 'Checked-In', 'Waiting', 'In Consultation', 'Completed', 'Cancelled']
            if ((!statuses.includes(after.status) && (!before || before.status !== after.status)) ||
              (after.visitStatus !== undefined && !['Waiting', 'In Consultation', 'Completed'].includes(after.visitStatus))) {
              return reject(request, response, 400, 'Choose a valid booking status and visit progress.')
            }
            if (before && before.status && after.status && before.status !== after.status) {
              if (!VALID_TRANSITIONS[before.status]?.includes(after.status)) {
                return reject(request, response, 400, `Invalid appointment status transition from ${before.status} to ${after.status}.`)
              }
            }
            if (before && before.visitStatus && after.visitStatus && before.visitStatus !== after.visitStatus) {
              if (!VALID_VISIT_TRANSITIONS[before.visitStatus]?.includes(after.visitStatus)) {
                return reject(request, response, 400, `Invalid visit progress transition from ${before.visitStatus} to ${after.visitStatus}.`)
              }
            }
          }
          if (collection === 'schedules' && after) {
            const doctor = await db.prepare('SELECT name, active FROM doctors WHERE name = ?').get(after.doctor)
            if (!doctor || !doctor.active) {
              return reject(request, response, 400, 'Choose an active managed doctor for this schedule.')
            }
            after.doctor = doctor.name
            const start = appointmentMinutes(after.start)
            const end = appointmentMinutes(after.end)
            if (!after.doctor || !parseDate(after.date) || !/^\d{4}-\d{2}-\d{2}$/.test(after.date) || `${after.doctor}|${after.date}` !== id ||
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
          if (collection === 'appointments' && before?.status === 'Cancelled' && after && !isDeepStrictEqual(before, after)) {
            return reject(request, response, 400, 'Cancelled bookings are read-only history. Create a new booking instead.')
          }
          if (collection === 'appointments' && before?.status === 'Completed' && after?.status !== 'Completed') {
            return reject(request, response, 400, 'Completed appointments cannot return to an earlier status.')
          }
          if (collection === 'appointments' && before?.visitStatus === 'Completed' && after?.visitStatus !== 'Completed') {
            return reject(request, response, 400, 'Completed visits cannot return to an earlier stage.')
          }
          if (collection === 'appointments' && after?.visitStatus === 'Completed' && after.status !== 'Completed') {
            return reject(request, response, 400, 'A completed visit must also have a completed appointment status.')
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
            const cleanAfter = after ? stripUnknownFields(collection, after, request.user.role) : null
            if (after === null) {
              if (collection === 'patients') {
                for (const visit of before.visits || []) await audit.run(new Date().toISOString(), request.user.username, request.user.role,
                  'visit_records', `${id}|${visit.id}`, 'delete', JSON.stringify(visit), null)
                ;(await db.prepare('DELETE FROM visit_records WHERE patient_id = ?').run(id))
              }
              ;(await remove.run(collection, id))
            } else if (before === null) {
              ;(await insert.run(collection, id, JSON.stringify(collection === 'patients' ? storePatient(cleanAfter) : cleanAfter)))
            } else {
              ;(await update.run(JSON.stringify(collection === 'patients' ? storePatient(cleanAfter) : cleanAfter), collection, id))
              if (collection === 'patients') {
                // Synchronize appointment patient name & contact if changed
                if (before.name !== cleanAfter.name || before.contact !== cleanAfter.contact) {
                  const apptRows = await db.prepare("SELECT id, data FROM records WHERE collection = 'appointments'").all()
                  const updateAppt = db.prepare("UPDATE records SET data = ? WHERE collection = 'appointments' AND id = ?")
                  for (const row of apptRows) {
                    const appt = JSON.parse(row.data)
                    if (appt.patientId === id) {
                      appt.patientName = cleanAfter.name
                      if (cleanAfter.contact) appt.contact = cleanAfter.contact
                      await updateAppt.run(JSON.stringify(appt), appt.id)
                    }
                  }
                }
              }
            }
            if (collection === 'patients' && cleanAfter) (await syncVisits(cleanAfter, request.user, audit))
            ;(await audit.run(new Date().toISOString(), request.user.username, request.user.role, collection, id,
              after === null ? 'delete' : before === null ? 'create' : 'update',
              before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(cleanAfter)))
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

          // Sync relational tables now that records & cross-record invariants are validated
          for (const { collection, id, after } of changes) {
            const cleanAfter = after ? stripUnknownFields(collection, after, request.user.role) : null
            if (after === null) {
              if (collection === 'patients') (await db.prepare('DELETE FROM patients_rel WHERE id = ?').run(id))
              else if (collection === 'appointments') (await db.prepare('DELETE FROM appointments_rel WHERE id = ?').run(id))
              else if (collection === 'schedules') (await db.prepare('DELETE FROM schedules_rel WHERE id = ?').run(id))
            } else if (collection === 'patients') {
              await syncRelationalPatient(cleanAfter)
            }
          }
          for (const { collection, id, after } of changes) {
            const cleanAfter = after ? stripUnknownFields(collection, after, request.user.role) : null
            if (after !== null && collection === 'appointments') {
              await syncRelationalAppointment(cleanAfter)
            } else if (after !== null && collection === 'schedules') {
              await syncRelationalSchedule(id, cleanAfter)
            }
          }

          ;(await db.exec('COMMIT'))
          return response.json((await readState()))
        } catch (error) {
          ;(await db.exec('ROLLBACK'))
          if (error.code && error.code.startsWith('SQLITE_CONSTRAINT')) {
            return reject(request, response, 400, error.message)
          }
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
