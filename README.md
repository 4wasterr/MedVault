# MedVault

## Run the system with saved data

Start the Linux Mint PostgreSQL VM, then run `npm.cmd run dev` (or
`npm.cmd run dev:full`) from this folder. Open **http://localhost:5173/**.
The API runs on port 5000 and saves shared records in PostgreSQL.
`npm.cmd run db:verify` checks connectivity and read/write permissions.
Keep the VM and API running while entering data.

Port **5174** is the separate frontend demo. It uses fictional records in memory
and resets on refresh; use port **5173** for persistent patient records.

## Share through Cloudflare

For a temporary public HTTPS URL for the full system, run `npm run tunnel:setup`
once, start the Linux Mint PostgreSQL VM, then run `npm run tunnel`. In
PowerShell, use `npm.cmd`. See [setup, login, and troubleshooting](docs/CLOUDFLARE_TUNNEL.md).

## Frontend demo for groupmates

Use **Node.js 24 or newer**. After cloning or pulling this repository, run these
commands from the repository root:

```sh
npm run setup:demo
npm run demo
```

Open the **Local** link printed in the terminal, usually **http://localhost:5174/**.
If that port is busy, Vite picks the next available port and prints its link.
`npm run demo` starts this preview. Only the frontend dependencies are installed and
only Vite starts. PostgreSQL, the Linux Mint VM, the API server, Docker, and a
server `.env` file are unnecessary for this preview.

If PowerShell blocks `npm.ps1`, use `npm.cmd run setup:demo` and
`npm.cmd run demo` instead. On macOS/Linux or in Command Prompt, use `npm`.

| Demo username | Role | Password |
| --- | --- | --- |
| `demo.receptionist` | Receptionist | `DemoPass123!` |
| `demo.secretary` | Medical Secretary | `DemoPass123!` |
| `demo.admin` | Super Admin | `DemoPass123!` |

Explore patients, appointments, doctor schedules, staff accounts, doctor
management, and activity logs. Registration requests can be approved by the demo
administrator. Edits are held in browser memory and remain available when signing
out and switching roles in the same tab. **Refreshing the page or selecting Reset
demo restores the sample records and signs you out.** Each tab is independent.
Use fictional details and disposable passwords only.

This is a UI preview: database persistence, shared updates between computers,
server validation, authentication security, and protected audit storage require
the full system. The demo uses a separate port and draft namespace, never calls
the API, and never imports records from your real browser session or database.

Stop it with Ctrl+C before reinstalling dependencies. After pulling later changes,
rerun `npm run setup:demo` if frontend dependencies changed. If the terminal says
`'vite' is not recognized`, the frontend dependencies are missing or an install
was interrupted; stop any running MedVault dev servers and rerun the setup command.

## Full system with PostgreSQL

`npm run dev:full` starts the frontend on port 5173
and the API on port 5000. Install the server/client dependencies and keep the
configured PostgreSQL database running. Follow [the PostgreSQL setup guide](docs/POSTGRESQL.md)
and [the API guide](backend/README.md).
