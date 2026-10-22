const fs = require('node:fs')
const path = require('node:path')

const REQUIRED_TABLES = Object.freeze([
  'records', 'sessions', 'login_attempts', 'audit_events', 'staff_accounts', 'doctors',
  'visit_records', 'admin_mfa', 'password_resets', 'patients_rel', 'appointments_rel',
  'schedules_rel', 'encounters', 'emergency_access_grants', 'patient_consents', 'patient_documents',
])

async function verifyPostgresSchema(client) {
  const result = await client.query(`SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`)
  const existing = new Set(result.rows.map(row => row.table_name))
  const missing = REQUIRED_TABLES.filter(table => !existing.has(table))
  if (missing.length) throw new Error(`Missing PostgreSQL tables: ${missing.join(', ')}`)
  return REQUIRED_TABLES
}

async function ensurePostgresSchema(client) {
  const sql = fs.readFileSync(path.resolve(__dirname, '../sql/schema.sql'), 'utf8')
  await client.query('BEGIN')
  try {
    // Serialize schema changes when multiple API processes start together.
    await client.query('SELECT pg_advisory_xact_lock(506758, 1)')
    await client.query(sql)
    const tables = await verifyPostgresSchema(client)
    await client.query('COMMIT')
    return tables
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  }
}

module.exports = { REQUIRED_TABLES, ensurePostgresSchema, verifyPostgresSchema }
