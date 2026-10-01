# MedVault frontend

Run `npm run dev` from the repository root, then open `http://localhost:5173/`. In PowerShell, use `npm.cmd run dev` if Windows blocks `npm.ps1` under its execution policy. The command starts the React frontend and API if needed; if they are already running, it prints the existing URL without trying to claim the ports again. Use Node.js 22.13 or newer.

The visible pages are React JSX files, not standalone HTML pages. Edit these source files for changes to appear in the browser:

- Receptionist and login: `frontend/pages/receptionist/`
- Medical secretary: `frontend/pages/medical secretary/`
- Super Admin dashboard, user management, and doctor management: `frontend/pages/super admin/`
- Shared app routing and state: `frontend/client/src/App.jsx`
- Global styles: `frontend/client/src/index.css`

The HTML file at `frontend/client/index.html` only mounts the React app. The similarly named files in `frontend/client/src/pages/` are older copies and are not imported by the running app. The app builds from `frontend/pages/` for both development and production.

Save an edited JSX or CSS file while the dev server is running to update the page. If viewing the production build through the API server, run `npm run build` again after edits. Opening `index.html` directly from disk does not start the app.
