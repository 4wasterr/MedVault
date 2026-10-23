const { isDeepStrictEqual } = require('node:util')

const groups = {
  patients: {
    'Personal details': ['name', 'age', 'sex', 'birthday', 'contact', 'address', 'emergencyName', 'emergencyContact'],
    Vitals: ['vitals'], 'Medical history': ['medical', 'medicalHistory'], Consultation: ['consultation'],
    'Visit history': ['visits', 'appointments'], Notes: ['recordNotes'], 'Visit details': ['doctor', 'type', 'status', 'date'],
  },
  appointments: { 'Booking details': ['doctor', 'date', 'time', 'type', 'room'], 'Patient details': ['patientId', 'patientName', 'age', 'sex', 'contact', 'address', 'emergencyName', 'emergencyContact'],
    'Booking status': ['status'], 'Visit progress': ['visitStatus'], Notes: ['notes'] },
  schedules: { 'Schedule details': ['doctor', 'date', 'start', 'end'], 'Blocked slots': ['blocked'] },
  staff_accounts: { 'Profile details': ['username', 'firstName', 'middleName', 'lastName', 'address', 'phone', 'email'], Role: ['role'], 'Account status': ['status'] },
  doctors: { 'Doctor profile': ['name', 'specialty', 'phone', 'email'], 'Secretary assignment': ['secretaryUsername', 'secretary_username'], 'Active status': ['active'] },
  visit_records: { 'Visit details': ['date', 'doctor', 'type'], 'Clinical details': ['summary', 'diagnosis', 'treatment', 'followUp', 'vitalsSummary', 'notes'] },
}
const names = { patients: 'Patient record', appointments: 'Appointment', schedules: 'Doctor schedule', staff_accounts: 'Staff account', doctors: 'Doctor profile', visit_records: 'Visit record', modules: 'Module', all: 'Shared records' }
class AuditQueryError extends Error {}
const messages = {
  login: 'Signed in successfully.', logout: 'Signed out.', 'login-failed': 'Sign-in failed: incorrect credentials.',
  'login-blocked': 'Sign-in blocked while the account is locked.', 'account-locked': 'Account locked after five failed sign-ins.',
  registration: 'Submitted a staff registration for approval.', 'password-reset': 'Administrator reset the account password and revoked its sessions.',
  'session-expired': 'Session expired and was revoked.', approve: 'Approved the staff registration.', reject: 'Declined the staff registration.',
  import: 'Imported browser records into the shared database.', 'doctor-rename': 'Updated a reference after a doctor was renamed.',
}

// Summaries deliberately contain field groups, never clinical values or credentials.
function describeAudit(row) {
  const before = row.before_data ? JSON.parse(row.before_data) : null
  const after = row.after_data ? JSON.parse(row.after_data) : null
  if (messages[row.action]) return messages[row.action]
  if (row.action === 'login-denied') return 'Sign-in denied because account access is not approved.'
  if (row.action === 'access-denied') return 'Access denied by the current role permissions.'
  if (row.action === 'change-rejected') return 'Requested change rejected by validation or a record conflict.'
  if (row.action === 'view') {
    const sections = { personal: 'Personal Information', medical: 'Medical Information', appointments: 'Appointment History', vitals: 'Vitals',
      medicalHistory: 'Medical History', consultation: 'Consultation', visits: 'Visit History', notes: 'Notes', apptInfo: 'Appointment Information', patientInfo: 'Patient Information' }
    return row.collection === 'modules' ? 'Opened this module.' : sections[after?.section] ? `Viewed the ${sections[after.section]} section.` : 'Viewed shared records.'
  }
  const verb = { create: 'created', update: 'updated', delete: 'deleted', 'import-create': 'imported', 'import-update': 'updated during import', 'import-delete': 'removed during import' }[row.action]
  if (!verb) return 'Recorded a system action.'
  const changed = before && after ? Object.entries(groups[row.collection] || {})
    .filter(([, fields]) => fields.some(field => !isDeepStrictEqual(before[field], after[field]))).map(([label]) => label) : []
  return `${names[row.collection] || 'Record'} ${verb}.${changed.length ? ` Changed: ${changed.join(', ')}.` : ''}`
}

async function listAudit(db, query) {
  const single = (key, fallback = '') => {
    const value = query[key] ?? fallback
    if (typeof value !== 'string') throw new AuditQueryError('Invalid audit filter.')
    return value.trim()
  }
  const positive = (key, fallback) => {
    const value = single(key, String(fallback))
    if (!/^[1-9]\d{0,8}$/.test(value)) throw new AuditQueryError('Invalid audit page.')
    return Number(value)
  }
  const requestedPage = positive('page', 1)
  const pageSize = positive('pageSize', 25)
  if (![10, 25, 50, 100].includes(pageSize)) throw new AuditQueryError('Choose 10, 25, 50, or 100 rows per page.')
  const sort = single('sort', 'occurred_at')
  const order = single('order', 'desc')
  if (!['occurred_at', 'username', 'role', 'collection', 'action'].includes(sort) || !['asc', 'desc'].includes(order)) throw new AuditQueryError('Invalid audit sort.')
  const where = []
  const params = []
  for (const field of ['username', 'role', 'action', 'collection']) {
    const value = single(field)
    if (value.length > 80) throw new AuditQueryError('Audit filter is too long.')
    if (value) { where.push(`${field} = ?`); params.push(value) }
  }
  const search = single('search')
  if (search.length > 120) throw new AuditQueryError('Audit search is too long.')
  if (search) {
    where.push("(username LIKE ? ESCAPE '\\' OR role LIKE ? ESCAPE '\\' OR action LIKE ? ESCAPE '\\' OR collection LIKE ? ESCAPE '\\' OR record_id LIKE ? ESCAPE '\\')")
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`
    params.push(pattern, pattern, pattern, pattern, pattern)
  }
  const from = single('from')
  const to = single('to')
  for (const [value, operator] of [[from, '>='], [to, '<']]) {
    if (!value) continue
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new AuditQueryError('Invalid audit date range.')
    where.push(`occurred_at ${operator} ?`); params.push(value)
  }
  if (from && to && from >= to) throw new AuditQueryError('Start date must be before the end date.')
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const total = (await db.raw(`SELECT COUNT(*) AS count FROM audit_events${clause}`, params, 'get')).count
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)))
  const rows = await db.prepare(`SELECT * FROM audit_events${clause} ORDER BY ${sort} ${order}, id ${order} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize)
  const options = {}
  for (const [key, field] of [['users', 'username'], ['roles', 'role'], ['actions', 'action'], ['collections', 'collection']]) {
    options[key] = (await db.raw(`SELECT DISTINCT ${field} AS value FROM audit_events ORDER BY ${field}`)).map(row => row.value)
  }
  return { rows: rows.map(({ before_data, after_data, ...row }) => {
    const details = after_data ? JSON.parse(after_data) : null
    const context = ['access-denied', 'change-rejected'].includes(row.action) && ['GET', 'POST', 'PATCH'].includes(details?.method) &&
      typeof details.path === 'string' && details.path.startsWith('/api/') && [400, 403, 409].includes(details.status)
      ? `${details.method} ${details.path} (HTTP ${details.status})` : ''
    return { ...row, summary: describeAudit({ ...row, before_data, after_data }), context }
  }), total, page, pageSize, options }
}

module.exports = { listAudit, describeAudit, AuditQueryError }
