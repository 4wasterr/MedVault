# PostgreSQL in the Linux Mint VM

MedVault on Windows connects to PostgreSQL 16 in the running **Linux Mint 22.3**
VirtualBox VM. The application uses one database, `medvault`, with 16 tables in
the `public` schema. Separate databases per feature are unnecessary.

| Setting | Windows application or pgAdmin | Inside Linux Mint |
| --- | --- | --- |
| Host | `127.0.0.1` | `127.0.0.1` |
| Port | `5433` | `5432` |
| Database | `medvault` | `medvault` |
| User | `medvault_user` | `medvault_user` |

VirtualBox forwards Windows `127.0.0.1:5433` to the guest's port `5432`.
Windows port `5432` belongs to a separate Windows PostgreSQL installation.
Keep the VM running while using MedVault.

The generated database password is saved in `frontend/server/.env`, which Git
ignores. Use its `PGPASSWORD` value when adding a pgAdmin connection. Keep it
private. The role owns this database and has no superuser, role-creation, or
database-creation privileges. Existing encryption and session keys remain in
`frontend/server/data`; preserve those keys with any database backup.

From the repository root in PowerShell:

```powershell
npm.cmd run db:setup
npm.cmd run db:verify
npm.cmd run test:postgres
npm.cmd run dev:full
```

`db:setup` creates missing tables, indexes, and audit protections in a transaction
without deleting existing records. `db:verify` checks all tables, reads and writes
a temporary diagnostic record, and checks audit update/delete prevention. All
diagnostic records are rolled back; failed checks exit with an error.

The API also checks the complete schema on startup. When PostgreSQL is configured,
a connection or schema failure stops startup instead of saving to a local database.
`GET /api/health` checks database connectivity and reports `storage: "PostgreSQL"`.
Unit tests use isolated SQLite databases; PostgreSQL integration tests use a
temporary schema and remove it afterward.

| Tables | Purpose |
| --- | --- |
| `records` | Encrypted application documents for patients, appointments, schedules |
| `patients_rel` | Patient profiles and search fields |
| `visit_records` | Separate patient visit documents |
| `appointments_rel` | Appointment details and patient links |
| `schedules_rel` | Doctor schedules |
| `doctors` | Physician directory and staff assignments |
| `staff_accounts` | Registration, approval, roles, password hashes, staff MFA |
| `sessions` | Revocable sign-in sessions |
| `login_attempts` | Failed-login tracking and lockouts |
| `audit_events` | Hash-chained audit history with update/delete prevention |
| `admin_mfa` | Bootstrap administrator MFA |
| `password_resets` | Expiring password-reset requests |
| `encounters` | Consultations, prescriptions, signatures, addenda |
| `emergency_access_grants` | Time-limited emergency record access |
| `patient_consents` | Recorded consent decisions |
| `patient_documents` | Patient attachments and metadata |

To inspect the tables directly in a Mint terminal:

```sh
sudo -u postgres psql -d medvault
```

Then run `\dt public.*`. In pgAdmin, connect using the settings above and refresh
**Databases → medvault → Schemas → public → Tables**.

The existing SQLite deployment and backup guide describes the older Docker setup.
Its SQLite backup commands do not back up the VM PostgreSQL database. Use PostgreSQL
backups (such as `pg_dump`) and retain the application's encryption keys separately.
Existing SQLite files are preserved; changing connections does not import their history.
