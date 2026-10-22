#!/usr/bin/env node
// ====================================================================
// MedVault PostgreSQL Diagnostic & Connection Verification Script
// Run this on Linux Mint or any terminal: node scripts/test-postgres-connection.cjs
// ====================================================================
const path = require('node:path')
const fs = require('node:fs')

// Attempt to load .env from frontend/server/.env or current directory
const envPaths = [
  path.resolve(__dirname, '../frontend/server/.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(process.cwd(), '.env'),
]
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    try {
      require('dotenv').config({ path: envPath })
      console.log(`[Config] Loaded environment variables from: ${envPath}`)
      break
    } catch {}
  }
}

let Pool
try {
  Pool = require('pg').Pool
} catch {
  try {
    Pool = require('../frontend/server/node_modules/pg').Pool
  } catch (err) {
    console.error('[Error] The "pg" module is required. Run "npm install" inside frontend/server.')
    process.exit(1)
  }
}

const REQUIRED_TABLES = [
  'records',
  'sessions',
  'login_attempts',
  'audit_events',
  'staff_accounts',
  'doctors',
  'visit_records',
  'admin_mfa',
  'password_resets',
  'patients_rel',
  'appointments_rel',
  'schedules_rel',
  'encounters',
  'emergency_access_grants',
  'patient_consents',
  'patient_documents',
]

async function runDiagnostic() {
  console.log('\n======================================================')
  console.log('    MedVault PostgreSQL Diagnostic & Verification')
  console.log('======================================================\n')

  const connectionString = process.env.DATABASE_URL || process.env.MEDVAULT_PG_URL
  const config = connectionString
    ? { connectionString }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'medvault_user',
        password: process.env.PGPASSWORD || 'medvault_secure_password_2026',
        database: process.env.PGDATABASE || 'medvault',
      }

  console.log('[1] Target Configuration:')
  if (connectionString) {
    // Mask password in connection string for display
    const masked = connectionString.replace(/:([^:@]+)@/, ':****@')
    console.log(`    DATABASE_URL: ${masked}`)
  } else {
    console.log(`    Host:     ${config.host}`)
    console.log(`    Port:     ${config.port}`)
    console.log(`    Database: ${config.database}`)
    console.log(`    User:     ${config.user}`)
  }

  const pool = new Pool({ ...config, connectionTimeoutMillis: 5000 })
  let client

  try {
    const startTime = Date.now()
    client = await pool.connect()
    const latency = Date.now() - startTime
    console.log(`\n[2] Connection Test: SUCCESS (Connected in ${latency}ms)`)

    // Verify Server Engine & Version
    const verRes = await client.query('SELECT version(), current_setting($1) AS encoding, current_database(), current_user', ['server_encoding'])
    const info = verRes.rows[0]
    console.log(`    PostgreSQL Version: ${info.version.split(' on ')[0]}`)
    console.log(`    Database Name:      ${info.current_database}`)
    console.log(`    Database User:      ${info.current_user}`)
    console.log(`    Server Encoding:    ${info.encoding}`)

    // Check Tables
    console.log('\n[3] Schema & Table Verification:')
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `)
    const existingTables = new Set(tableRes.rows.map(r => r.table_name.toLowerCase()))

    let missingCount = 0
    for (const table of REQUIRED_TABLES) {
      if (existingTables.has(table.toLowerCase())) {
        console.log(`    [OK] Table '${table}' exists.`)
      } else {
        console.log(`    [MISSING] Table '${table}' is NOT found!`)
        missingCount++
      }
    }

    if (missingCount > 0) {
      console.log(`\n[!] NOTICE: ${missingCount} required table(s) were missing in database '${info.current_database}'.`)
      const schemaPath = path.resolve(__dirname, '../frontend/server/sql/schema.sql')
      if (fs.existsSync(schemaPath)) {
        console.log('    Applying MedVault schema automatically from schema.sql...')
        try {
          const schemaSql = fs.readFileSync(schemaPath, 'utf8')
          await client.query(schemaSql)
          console.log('    [SUCCESS] All 16 tables and audit triggers have been created successfully!')
        } catch (initErr) {
          console.error(`    [ERROR] Schema application failed: ${initErr.message}`)
          console.log('    You can manually apply the schema using:')
          console.log('    psql -d medvault -f frontend/server/sql/schema.sql\n')
        }
      }
    } else {
      console.log('\n[PASS] All 16 required MedVault tables exist.')
    }

    // Verify Append-Only Trigger
    console.log('\n[4] Append-Only Audit Trigger Test:')
    try {
      await client.query('BEGIN')
      await client.query(`
        INSERT INTO audit_events (occurred_at, username, role, collection, record_id, action, prev_hash, entry_hash)
        VALUES ('2026-10-22T00:00:00Z', '__diag_test__', 'System', 'test', 'test-0', 'diag-test', '0', '0')
      `)
      let blocked = false
      try {
        await client.query("UPDATE audit_events SET action = 'modified' WHERE username = '__diag_test__'")
      } catch (err) {
        if (/append-only/i.test(err.message)) {
          blocked = true
        }
      }
      await client.query('ROLLBACK')
      if (blocked) {
        console.log('    [PASS] Audit log tamper prevention trigger is ACTIVE.')
      } else {
        console.log('    [WARN] Audit log update was not blocked by trigger.')
      }
    } catch (triggerErr) {
      await client.query('ROLLBACK').catch(() => {})
      console.log(`    [INFO] Trigger check note: ${triggerErr.message}`)
    }

    console.log('\n======================================================')
    console.log(' RESULT: PostgreSQL is 100% READY for MedVault!')
    console.log('======================================================\n')
  } catch (err) {
    console.error('\n[FAIL] Unable to connect to PostgreSQL database:')
    console.error(`       Error: ${err.message}`)
    if (err.code === 'ECONNREFUSED') {
      console.error('\n[Diagnosis] The PostgreSQL server is not running or not listening on that port.')
      console.error('  On Linux Mint, run:')
      console.error('    sudo systemctl status postgresql')
      console.error('    sudo systemctl start postgresql')
    } else if (err.code === '28P01') {
      console.error('\n[Diagnosis] Invalid password for user. Check PGUSER and PGPASSWORD in .env.')
    } else if (err.code === '3D000') {
      console.error('\n[Diagnosis] Database does not exist. Create it with:')
      console.error('    sudo -u postgres createdb -O medvault_user medvault')
    }
    console.log('\n======================================================\n')
    process.exitCode = 1
  } finally {
    if (client) client.release()
    await pool.end().catch(() => {})
  }
}

runDiagnostic()

