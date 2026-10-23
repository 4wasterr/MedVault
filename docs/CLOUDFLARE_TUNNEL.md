# Share MedVault through a free Cloudflare Tunnel

The full MedVault app can use a public HTTPS address such as
`https://random-name.trycloudflare.com`. No domain, Cloudflare account, router port
forwarding, or Docker installation is required for this Quick Tunnel.

Cloudflare forwards requests to MedVault on your computer. Your computer, this
terminal, Internet connection, and the Linux Mint PostgreSQL VM must stay running.
This is a temporary preview, not cloud storage or an always-on hosting service.
The URL changes every time the tunnel restarts. Cloudflare documents Quick
Tunnels as a development/testing feature with no uptime guarantee, a limit of
200 simultaneous requests, and no Server-Sent Events support. Use test data for
public previews. See [Cloudflare's Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## First-time setup on Windows

Use Node.js 24 or newer. In PowerShell, from the repository root:

```powershell
npm.cmd ci --prefix frontend/client
npm.cmd ci --prefix frontend/server
npm.cmd run tunnel:setup
```

The setup command downloads the current official `cloudflare/cloudflared` GitHub
release into `.tools/cloudflared.exe` and checks its SHA-256 digest before
installing it. It does not install a Windows service or require administrator
access. The executable is ignored by Git. An existing `cloudflared` on PATH also
works, or set `MEDVAULT_CLOUDFLARED_PATH` to its full executable path.

## Start sharing the full app

1. Start the **Linux Mint 22.3** VM so PostgreSQL is available at
   `127.0.0.1:5433`. The existing `frontend/server/.env` connection is reused.
2. Stop a local MedVault API using port 5000, or choose another tunnel port below.
3. Run:

```powershell
npm.cmd run tunnel
```

The launcher checks the database, builds the React UI, requests a Quick Tunnel,
and starts the API with the exact issued HTTPS address as its allowed origin.
It prints **MedVault public URL** when the API is ready. Open that address on
another computer or phone. The frontend and `/api` share this address, so no
client API URL, Vite host allowlist, or CORS wildcard is needed.

The launcher uses production security settings: HTTPS, Secure/HttpOnly cookies,
CSRF validation, and security headers. The Node server listens only on loopback;
only Cloudflare exposes the app. PostgreSQL is not published. Existing records
and encryption/session keys are preserved.

If no administrator credentials are configured, the tunnel uses `clinic.admin`
and creates a persistent random password in
`deploy/secrets/tunnel_admin_password`. Open that file privately to sign in; the
password is never printed by the launcher. The file is ignored by Git. Existing
staff accounts continue to work. Explicit `MEDVAULT_ADMIN_USERNAME` and
`MEDVAULT_ADMIN_PASSWORD` or `MEDVAULT_ADMIN_PASSWORD_FILE` settings take
precedence; weak bootstrap passwords stop startup.

To select another local port:

```powershell
$env:MEDVAULT_TUNNEL_PORT = '5050'
npm.cmd run tunnel
```

Keep the terminal open. **Ctrl+C** stops the tunnel and the API. The next run
creates a new public URL, while the password and database stay the same.
`npm run demo` starts the separate frontend-only demo on port 5174;
`npm run dev` and `npm run dev:full` start local development on port 5173.
Restart the tunnel after source changes so the public UI rebuilds. The launcher
prints **Database connected: PostgreSQL** when the API confirms its storage.
Cloudflare forwards to the API on port 5000, which connects to PostgreSQL in the
VM; it does not replace or disconnect the database. Data persists when the URL
changes, as long as the same database and encryption keys are used.

## Troubleshooting

- **Database unavailable:** start the VM and run `npm.cmd run db:verify`. The
  launcher stops before creating a tunnel and does not switch databases.
- **Port occupied:** stop the local API, or use `MEDVAULT_TUNNEL_PORT`.
- **No cloudflared executable:** run `npm.cmd run tunnel:setup` with Internet
  access. Official manual downloads are also available from
  [Cloudflare](https://developers.cloudflare.com/tunnel/downloads/).
- **A brief 502 while starting:** Cloudflare may issue its URL a few seconds
  before the API starts. Wait for **MedVault public URL**, then reload.
- **Cloudflare connection errors:** allow outbound Cloudflare Tunnel connections
  through the host/network firewall. No inbound firewall rule is needed. Follow
  [Cloudflare's firewall requirements](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/).
- **Origin rejected after restarting:** use the newest URL printed in the
  terminal. Each Quick Tunnel has its own allowed origin.

For a fixed hostname or unattended hosting, use a named Cloudflare Tunnel with a
domain in your Cloudflare account and configure it to forward to
`http://127.0.0.1:5000`. A stable domain is a separate setup; the free random
Quick Tunnel URL needs no domain purchase.
