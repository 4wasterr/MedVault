# MedVault data service

The running API is in `frontend/server/src`. It stores patient profiles, separate visit records, appointments, doctor profiles and schedules, staff accounts, sessions, and an audit trail. The Windows application is configured to use PostgreSQL inside the Linux Mint VM; see [the connection, table list, and verification commands](../docs/POSTGRESQL.md). The frontend calls it through `/api`; it does not store clinical records in browser storage.

The remaining SQLite deployment notes describe local storage when PostgreSQL is not configured. A configured PostgreSQL connection must succeed; the API never silently switches to SQLite on connection failure.

## Run locally

Use Node.js 24 or newer.

1. Install the existing project dependencies with `npm install` in `frontend`, `frontend/client`, and `frontend/server` if needed.
2. Run `npm run dev` from the repository root for the Vite UI and API together. In PowerShell, run `npm.cmd run dev` if `npm.ps1` is blocked. The launcher reuses an existing MedVault frontend or API instead of failing on its port.
3. To serve the built UI locally, run `npm run build` from the repository root, then `npm start --prefix frontend/server`. Open `http://127.0.0.1:5000`. The API binds to loopback by default; use `HOST=0.0.0.0` only for a controlled development LAN. For production HTTPS, follow [the SQLite deployment guide](../deploy/README.md).

Fresh local installations keep only the bootstrap Super Admin login: `user3` / `user3`. Override these credentials with `MEDVAULT_ADMIN_USERNAME` and `MEDVAULT_ADMIN_PASSWORD`. Create Receptionist and Medical Secretary accounts through User Management, or use signup and approve the requests as the Super Admin. No demo staff accounts are created during normal startup.

New staff use the **Sign up here** page to request a Receptionist or Medical Secretary account. Registration details and a salted password hash are saved in `staff_accounts` with `pending` status. Pending accounts cannot sign in. A Super Admin signs in to User Management to approve or decline requests, create accounts (including additional Super Admins), change roles, edit details, and deactivate access. The admin API never returns password hashes. Doctor Management stores physician profiles and secretary assignments in the configured database. Assigned secretaries can edit their doctors' schedules; unassigned doctors remain available to all medical secretaries.

Without PostgreSQL settings, local SQLite storage defaults to `frontend/server/data/medvault_storage.db` and can be moved with `MEDVAULT_DB_PATH`. The data directory is excluded from Git. Development creates persistent `medvault_encryption_key.key` and `medvault_jwt_secret.key` files there, including when PostgreSQL is used. Preserve these keys with the database when moving an installation. Fresh databases start with no patients, appointments, doctors, schedules, or staff records, and empty collections stay empty after restarting. Automated tests explicitly opt in to isolated demo fixtures using `createApp({ seedDemo: true })`; production always disables them. Production requires configured secrets. PostgreSQL setup and checks are documented in the [VM guide](../docs/POSTGRESQL.md).

The server checks signed, revocable JWT sessions and existing role permissions, saves related changes in one transaction, rejects stale record updates and booking conflicts, and retains cancelled bookings. Passwords use salted bcrypt; five failures lock a username for fifteen minutes. Sessions expire after thirty idle minutes or eight hours total; background refreshes do not extend idle time. Medical and identifying fields, including audit snapshots, use AES-256-GCM encryption. `audit_events` retains SHA-256 chained, append-only entries. Other staff browser sessions refresh every four seconds.

If the previous browser-only version stored records on this computer, sign in as the medical secretary and use **Import Browser Records**. Import is available before shared clinical records have been changed. The browser copy stays in place if import fails.

The [security scope, role matrix, risk assessment and verification results](../docs/SECURITY.md) explain the controls and remaining host acceptance checks. Encrypted SQLite backup and restore commands are included in `frontend/server/scripts/backup.cjs`; the deployment guide covers the daily cron job and recovery. Production requires `NODE_ENV=production`, `MEDVAULT_PUBLIC_ORIGIN`, encryption/JWT key files and a strong bootstrap password. The default bootstrap login and local HTTP remain for development.

