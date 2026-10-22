-- ====================================================================
-- MedVault Production PostgreSQL Schema
-- Platform: Linux Mint / Ubuntu Linux / Enterprise PostgreSQL 14+
-- ====================================================================

-- 1. COLLATIONS (UUIDs and encryption are provided by the API)

-- Case-insensitive collation for usernames, emails, and doctor names
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_collation c JOIN pg_namespace n ON n.oid = c.collnamespace
                   WHERE c.collname = 'nocase' AND n.nspname = current_schema()) THEN
        CREATE COLLATION nocase (provider = icu, locale = 'und-u-ks-level2', deterministic = false);
    END IF;
END $$;

-- 2. CORE DOCUMENT & SESSION TABLES
CREATE TABLE IF NOT EXISTS records (
    collection VARCHAR(64) NOT NULL,
    id VARCHAR(128) NOT NULL,
    data TEXT NOT NULL,
    rowid BIGSERIAL,
    PRIMARY KEY (collection, id)
);
ALTER TABLE records ADD COLUMN IF NOT EXISTS rowid BIGSERIAL;
CREATE INDEX IF NOT EXISTS idx_records_collection ON records (collection);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash VARCHAR(64) PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    expires_at BIGINT NOT NULL,
    last_seen_at BIGINT NOT NULL DEFAULT 0
);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at BIGINT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions (username);

CREATE TABLE IF NOT EXISTS login_attempts (
    username VARCHAR(100) PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    last_attempt BIGINT NOT NULL,
    locked_until BIGINT NOT NULL DEFAULT 0
);
-- 3. CRYPTOGRAPHIC TAMPER-EVIDENT AUDIT TRAIL
CREATE TABLE IF NOT EXISTS audit_events (
    id BIGSERIAL PRIMARY KEY,
    occurred_at VARCHAR(35) NOT NULL,
    username VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    collection VARCHAR(64) NOT NULL,
    record_id VARCHAR(128) NOT NULL,
    action VARCHAR(64) NOT NULL,
    before_data TEXT,
    after_data TEXT,
    prev_hash VARCHAR(64) NOT NULL DEFAULT '',
    entry_hash VARCHAR(64) NOT NULL DEFAULT ''
);
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS before_data TEXT;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS after_data TEXT;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS prev_hash VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS entry_hash VARCHAR(64) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_events (occurred_at, id);
CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_events (username, occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_collection_time ON audit_events (collection, occurred_at);

-- Append-Only Trigger Function & Triggers for Audit Integrity
CREATE OR REPLACE FUNCTION audit_events_prevent_modify()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_no_update ON audit_events;
CREATE TRIGGER audit_no_update
BEFORE UPDATE ON audit_events
FOR EACH ROW EXECUTE FUNCTION audit_events_prevent_modify();

DROP TRIGGER IF EXISTS audit_no_delete ON audit_events;
CREATE TRIGGER audit_no_delete
BEFORE DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION audit_events_prevent_modify();

-- 4. STAFF & CLINIC DIRECTORY
CREATE TABLE IF NOT EXISTS staff_accounts (
    username VARCHAR(100) PRIMARY KEY,
    password_salt VARCHAR(64) NOT NULL DEFAULT '',
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100) NOT NULL DEFAULT '',
    last_name VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at VARCHAR(35) NOT NULL,
    reviewed_at VARCHAR(35),
    reviewed_by VARCHAR(100),
    mfa_secret VARCHAR(255) NOT NULL DEFAULT '',
    mfa_enabled INTEGER NOT NULL DEFAULT 0,
    mfa_backup_codes TEXT NOT NULL DEFAULT '[]',
    doctor_id VARCHAR(128) NOT NULL DEFAULT '',
    must_change_password INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS mfa_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS doctor_id VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS must_change_password INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_staff_status ON staff_accounts (status);
CREATE INDEX IF NOT EXISTS idx_staff_email ON staff_accounts (email);
CREATE INDEX IF NOT EXISTS idx_staff_doctor ON staff_accounts (doctor_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_username_nocase ON staff_accounts (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_email_nocase ON staff_accounts (lower(email));

CREATE TABLE IF NOT EXISTS doctors (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(160) NOT NULL UNIQUE,
    specialty VARCHAR(120) NOT NULL DEFAULT '',
    phone VARCHAR(50) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL DEFAULT '',
    secretary_username VARCHAR(100) NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at VARCHAR(35) NOT NULL,
    doctor_username VARCHAR(100) NOT NULL DEFAULT ''
);
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS doctor_username VARCHAR(100) NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_doctors_active ON doctors (active);
CREATE INDEX IF NOT EXISTS idx_doctors_username ON doctors (doctor_username);
CREATE INDEX IF NOT EXISTS idx_doctors_secretary ON doctors (secretary_username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_name_nocase ON doctors (lower(name));

CREATE TABLE IF NOT EXISTS visit_records (
    patient_id VARCHAR(128) NOT NULL,
    id VARCHAR(128) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL,
    PRIMARY KEY (patient_id, id)
);
CREATE INDEX IF NOT EXISTS idx_visit_records_sort ON visit_records (patient_id, sort_order);

CREATE TABLE IF NOT EXISTS admin_mfa (
    username VARCHAR(100) PRIMARY KEY,
    mfa_secret VARCHAR(255) NOT NULL DEFAULT '',
    mfa_enabled INTEGER NOT NULL DEFAULT 0,
    mfa_backup_codes TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS password_resets (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code_hash VARCHAR(128) NOT NULL,
    reset_token_hash VARCHAR(128),
    expires_at BIGINT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at VARCHAR(35) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resets_email_exp ON password_resets (email, expires_at);

-- 5. RELATIONAL ENTITIES (PATIENTS, APPOINTMENTS, SCHEDULES)
CREATE TABLE IF NOT EXISTS patients_rel (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    age VARCHAR(10) NOT NULL DEFAULT '',
    sex VARCHAR(20) NOT NULL DEFAULT '',
    birthday VARCHAR(30) NOT NULL DEFAULT '',
    contact VARCHAR(50) NOT NULL DEFAULT '',
    normalized_phone VARCHAR(50) NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    emergency_name VARCHAR(200) NOT NULL DEFAULT '',
    emergency_contact VARCHAR(50) NOT NULL DEFAULT '',
    status VARCHAR(50) NOT NULL DEFAULT 'Waiting',
    data TEXT NOT NULL,
    created_at VARCHAR(35) NOT NULL,
    updated_at VARCHAR(35) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_patients_norm_name ON patients_rel (normalized_name, birthday);
CREATE INDEX IF NOT EXISTS idx_patients_norm_phone ON patients_rel (normalized_phone);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients_rel (status);

CREATE TABLE IF NOT EXISTS appointments_rel (
    id VARCHAR(128) PRIMARY KEY,
    patient_id VARCHAR(128) REFERENCES patients_rel(id) ON DELETE SET NULL,
    patient_name VARCHAR(200) NOT NULL DEFAULT '',
    doctor_name VARCHAR(160) NOT NULL,
    room VARCHAR(100) NOT NULL DEFAULT '',
    date VARCHAR(30) NOT NULL,
    time VARCHAR(30) NOT NULL,
    time_minutes INTEGER NOT NULL DEFAULT 0,
    type VARCHAR(100) NOT NULL DEFAULT '',
    status VARCHAR(50) NOT NULL DEFAULT 'Open',
    visit_status VARCHAR(50) NOT NULL DEFAULT '',
    contact VARCHAR(50) NOT NULL DEFAULT '',
    data TEXT NOT NULL,
    created_at VARCHAR(35) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appointments_rel_doc_date ON appointments_rel (doctor_name, date, time_minutes);
CREATE INDEX IF NOT EXISTS idx_appointments_rel_patient ON appointments_rel (patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_rel_date_status ON appointments_rel (date, status);

CREATE TABLE IF NOT EXISTS schedules_rel (
    id VARCHAR(128) PRIMARY KEY,
    doctor_name VARCHAR(160) NOT NULL,
    date VARCHAR(30) NOT NULL,
    start_time VARCHAR(30) NOT NULL,
    end_time VARCHAR(30) NOT NULL,
    data TEXT NOT NULL,
    CONSTRAINT uq_schedules_rel_doctor_date UNIQUE (doctor_name, date)
);

-- 6. CLINICAL ENCOUNTERS, EMERGENCY BREAK-GLASS & ATTACHMENTS
CREATE TABLE IF NOT EXISTS encounters (
    id VARCHAR(128) PRIMARY KEY,
    patient_id VARCHAR(128) NOT NULL REFERENCES patients_rel(id) ON DELETE CASCADE,
    doctor_id VARCHAR(128) NOT NULL,
    doctor_name VARCHAR(160) NOT NULL,
    appointment_id VARCHAR(128) DEFAULT '',
    encounter_date VARCHAR(30) NOT NULL,
    subjective TEXT NOT NULL DEFAULT '',
    objective TEXT NOT NULL DEFAULT '',
    vitals_snapshot TEXT NOT NULL DEFAULT '{}',
    assessment TEXT NOT NULL DEFAULT '',
    diagnosis TEXT NOT NULL DEFAULT '',
    treatment_plan TEXT NOT NULL DEFAULT '',
    prescriptions TEXT NOT NULL DEFAULT '[]',
    follow_up_date VARCHAR(30) NOT NULL DEFAULT '',
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    signed_at VARCHAR(35),
    signed_by_username VARCHAR(100),
    signature_hash VARCHAR(128),
    addenda TEXT NOT NULL DEFAULT '[]',
    created_at VARCHAR(35) NOT NULL,
    updated_at VARCHAR(35) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters (patient_id, encounter_date);
CREATE INDEX IF NOT EXISTS idx_encounters_doctor ON encounters (doctor_id, status);
CREATE INDEX IF NOT EXISTS idx_encounters_appt ON encounters (appointment_id);

CREATE TABLE IF NOT EXISTS emergency_access_grants (
    id VARCHAR(128) PRIMARY KEY,
    doctor_username VARCHAR(100) NOT NULL,
    doctor_id VARCHAR(128) NOT NULL,
    patient_id VARCHAR(128) NOT NULL,
    reason TEXT NOT NULL,
    consent_recorded INTEGER NOT NULL DEFAULT 1,
    granted_at VARCHAR(35) NOT NULL,
    expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_emergency_grants_doc ON emergency_access_grants (doctor_username, patient_id);
CREATE INDEX IF NOT EXISTS idx_emergency_grants_expires ON emergency_access_grants (expires_at);

CREATE TABLE IF NOT EXISTS patient_consents (
    id VARCHAR(128) PRIMARY KEY,
    patient_id VARCHAR(128) NOT NULL REFERENCES patients_rel(id) ON DELETE CASCADE,
    consent_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'granted',
    granted_by VARCHAR(100) NOT NULL DEFAULT 'Patient',
    notes TEXT NOT NULL DEFAULT '',
    recorded_by VARCHAR(100) NOT NULL,
    recorded_at VARCHAR(35) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consents_pat ON patient_consents (patient_id);

CREATE TABLE IF NOT EXISTS patient_documents (
    id VARCHAR(128) PRIMARY KEY,
    patient_id VARCHAR(128) NOT NULL REFERENCES patients_rel(id) ON DELETE CASCADE,
    uploader_username VARCHAR(100) NOT NULL,
    uploader_role VARCHAR(50) NOT NULL,
    doctor_id VARCHAR(128) NOT NULL DEFAULT '',
    document_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    content_base64 TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at VARCHAR(35) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_pat ON patient_documents (patient_id);

