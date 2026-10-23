# MedVault frontend

For a database-free preview, run `npm run setup:demo` and `npm run demo` from the
repository root, then open the Local link printed in the terminal (usually
`http://localhost:5174/`). See the [demo logins and
instructions](../../README.md). No API server or PostgreSQL database is needed.

For the full system, run `npm run dev` or `npm run dev:full` from the repository root, then open `http://localhost:5173/`. In PowerShell, use `npm.cmd` if Windows blocks `npm.ps1` under its execution policy. This command starts the React frontend and API and requires the configured PostgreSQL database. Use Node.js 24 or newer.

The visible pages are React JSX files, not standalone HTML pages. Edit these source files for changes to appear in the browser:

- Receptionist and login: `frontend/pages/receptionist/`
- Medical secretary: `frontend/pages/medical secretary/`
- Super Admin dashboard, user management, and doctor management: `frontend/pages/super admin/`
- Shared app routing and state: `frontend/client/src/App.jsx`
- Global styles: `frontend/client/src/index.css`

The HTML file at `frontend/client/index.html` only mounts the React app. The similarly named files in `frontend/client/src/pages/` are older copies and are not imported by the running app. The app builds from `frontend/pages/` for both development and production.

Save an edited JSX or CSS file while the dev server is running to update the page. If viewing the production build through the API server, run `npm run build` again after edits. Opening `index.html` directly from disk does not start the app.
