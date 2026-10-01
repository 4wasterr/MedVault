# MedVault data service

The running API is in `frontend/server/src`. It stores patient profiles, separate visit records, appointments, doctor profiles and schedules, staff accounts, sessions, and an audit trail in SQLite. The frontend calls it through `/api`; it does not store clinical records in browser storage.

## Run locally

Use Node.js 22.13 or newer.

1. Install the existing project dependencies with `npm install` in `frontend`, `frontend/client`, and `frontend/server` if needed.
2. Run `npm run dev` from the repository root for the Vite UI and API together. In PowerShell, run `npm.cmd run dev` if `npm.ps1` is blocked. The launcher reuses an existing MedVault frontend or API instead of failing on its port.
3. For a single server that other devices on the same network can reach, run `npm run build` from the repository root, then `npm start --prefix frontend/server`. Open `http://<server-host>:5000` from a device on that network.

Demo accounts: `user1` / `user1` (Receptionist), `user2` / `user2` (Medical Secretary), and `user3` / `user3` (Super Admin). The first two are seeded into User Management on first startup and can be edited or deactivated there. `user3` is a bootstrap admin managed by server configuration. The `MEDVAULT_RECEPTION_PASSWORD` and `MEDVAULT_SECRETARY_PASSWORD` environment values apply when the staff rows are first seeded; later password changes use User Management. Override the bootstrap credentials with `MEDVAULT_ADMIN_USERNAME` and `MEDVAULT_ADMIN_PASSWORD`.

New staff use the **Sign up here** page to request a Receptionist or Medical Secretary account. Registration details and a salted password hash are saved in `staff_accounts` with `pending` status. Pending accounts cannot sign in. A Super Admin signs in to User Management to approve or decline requests, create accounts (including additional Super Admins), change roles, edit details, and deactivate access. The admin API never returns password hashes. Doctor Management stores physician profiles and secretary assignments in the same SQLite database. Assigned secretaries can edit their doctors' schedules; unassigned doctors remain available to all medical secretaries.

The database defaults to `frontend/server/data/medvault.sqlite` and can be moved with `MEDVAULT_DB_PATH`. The data directory is excluded from Git. Back up the SQLite database before replacing or moving a running installation. A fresh database starts with the seven sample patients and ten sample bookings; sample bookings use the current date.

The server checks sessions and role permissions, saves related changes in one transaction, rejects stale record updates and booking conflicts, and retains cancelled bookings. `audit_events` stores the editor, time, and previous and new values for record edits. Other open staff browser sessions refresh from the server every four seconds.

If the previous browser-only version stored records on this computer, sign in as the medical secretary and use **Import Browser Records**. Import is available while the shared server still contains untouched demo data. The browser copy stays in place if import fails.

These demo credentials and local HTTP setup are intended for development. Use HTTPS, managed accounts, protected database backups, and a deployment security review before entering real patient information.

