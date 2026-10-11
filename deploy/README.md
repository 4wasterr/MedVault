# MedVault deployment with SQLite

The current roles and SQLite database are retained. PostgreSQL installation, containers, drivers and migration are deferred. These files prepare an Ubuntu HTTPS deployment; they do not change the current Windows machine or publish the application.

## Prepare the Ubuntu host

Use Ubuntu 24.04 LTS, Docker Engine with Compose v2, Node.js 24 for the secret generator, a clinic domain pointing to this server, and a valid certificate for that domain. Install `ufw`, `fail2ban`, `openssh-server` and `cron`. Keep the host and Docker packages patched. Place this repository at `/opt/medvault`.

Create a non-root SSH administrator. From the administrator's client, generate an RSA 4096-bit key with `ssh-keygen -t rsa -b 4096`, install its public key in the host account's `~/.ssh/authorized_keys`, and verify key-based access before applying the supplied SSH configuration. Protect the private key with a passphrase.

From `/opt/medvault`:

```sh
node deploy/scripts/generate-secrets.cjs
sudo install -d -m 700 -o 1000 -g 1000 deploy/backups
sudo install -d -m 700 deploy/certs
cp deploy/.env.example deploy/.env
```

Set `PUBLIC_ORIGIN` to the exact HTTPS URL, without a trailing slash. Place the issued full certificate chain and private key at `deploy/certs/fullchain.pem` and `deploy/certs/privkey.pem`. The NGINX container runs as UID 101; run `sudo chown 101:101 deploy/certs deploy/certs/fullchain.pem deploy/certs/privkey.pem`, keep the directory at mode 700 and files at mode 600, and arrange certificate renewal with those permissions preserved. Reload NGINX after renewal. Never commit certificates, `.env`, secrets or backups.

The generator creates independent random encryption, JWT and backup keys and a strong bootstrap administrator password. It preserves existing files. Read `deploy/secrets/admin_password` locally to sign in; do not print it into shared logs. Retain protected, separate copies of all keys. Losing the encryption key makes existing encrypted EHR data unreadable; losing the backup key makes backups unreadable.

For an existing installation, stop the old API and preserve its database and both local `.key` files before upgrading. Use that existing `medvault_encryption_key.key` as `deploy/secrets/encryption_key` and `medvault_jwt_secret.key` as `deploy/secrets/jwt_secret`; generating a different encryption key will prevent reading encrypted records. Populate the `medvault_api_data` volume with the stopped database, set ownership to UID/GID 1000 and mode 600, and keep the filenames consistent with Compose. Check and deactivate any development demo accounts before using production data. Production creates no demo staff or sample patient records in a fresh database.

## Start and inspect

```sh
docker compose -f deploy/compose.yml --env-file deploy/.env config --quiet
docker compose -f deploy/compose.yml --env-file deploy/.env build api
docker compose -f deploy/compose.yml --env-file deploy/.env up -d
docker compose -f deploy/compose.yml --env-file deploy/.env ps
curl --fail https://YOUR_CLINIC_DOMAIN/api/health
```

Only NGINX publishes ports 80 and 443. HTTP redirects to HTTPS; NGINX allows TLS 1.3. The API's port 3000 remains on the Docker network. SQLite is a file in the persistent `api_data` volume and has no listening network port. API and proxy run as non-root users, drop capabilities and have CPU, RAM and process limits. The API filesystem is read-only except its data volume and temporary directory. The maintenance backup container has no network access.

In the browser, create or approve staff accounts through the existing Super Admin User Management page. The roles remain Super Admin, Receptionist and Medical Secretary. The bootstrap administrator is configured through secrets; the server does not overwrite it from a staff form. Changing an account's password, role or approval status revokes its existing sessions.

## Firewall, SSH and Fail2ban

```sh
sudo SSH_USER=YOUR_ADMIN_USER sh deploy/scripts/harden-host.sh
```

This installs public-key-only SSH on port 2222, disables root login and password authentication, requires RSA keys of at least 4096 bits, prepares UFW default-deny rules and installs the Fail2ban filters. Verify a second connection from the client with `ssh -p 2222 YOUR_ADMIN_USER@YOUR_SERVER` before closing the first session. Then check `sudo ufw status numbered`, remove any obsolete allow rules (including port 22), and enable the firewall with `sudo ufw enable`. Confirm `sudo sshd -T` reports the intended settings.

The API sends structured access, failed-login, committed audit and system-error messages to the host journal. The MedVault Fail2ban jail consumes the API journal tag and bans offending IPs for one hour after five failures in fifteen minutes. It uses Docker's `DOCKER-USER` chain because Docker-published ports bypass ordinary UFW INPUT filtering. Use Docker's iptables firewall backend for this supplied action; an nftables-only Docker setup needs a corresponding Fail2ban action. The SSH jail uses UFW. Validate on the actual host:

```sh
sudo fail2ban-regex systemd-journal deploy/fail2ban/medvault.conf
sudo fail2ban-client status medvault
sudo journalctl CONTAINER_TAG=medvault-api --since today
```

Forward the journal to the clinic's protected log destination. Preserve `audit_checkpoint` hashes outside the database and compare them with `/api/admin/security` or the verification command below. Local hash chains detect changes, but host administrators can replace a database and local logs together; off-host retention is needed for independent evidence.

## Daily encrypted backups

```sh
sudo timedatectl set-timezone Asia/Manila
docker compose -f deploy/compose.yml --env-file deploy/.env run --rm --no-deps backup
sudo install -m 644 deploy/medvault-backup.cron /etc/cron.d/medvault-backup
```

The scheduled job runs at 02:00 each day and uses SQLite's online backup API to capture committed records, including the WAL, consistently. It validates the snapshot and audit chain, then streams AES-256-GCM encryption into a `.mvb` file and writes a SHA-256 checksum. Temporary snapshots are removed. Job logs go to `/var/log/medvault-backup.log`; alert on `backup_error` and missed daily `backup_completed` events. Copy encrypted backups off-host daily and keep at least 30 daily copies under the clinic's retention policy. Archive encryption keys separately from the database backups and protect the backup key separately from the backups it decrypts. The local job does not configure off-host storage or automatic retention deletion.

## Restore and restart

Choose the desired backup and restore the matching encryption key before restarting. The restore first authenticates the whole encrypted file, checks SQLite integrity and the audit chain, and saves a consistent `.pre-restore-*` snapshot of the previous database. An incorrect key or damaged backup cannot replace the existing database. The previous snapshot contains sensitive data and must stay in the protected volume until it is securely retired under clinic policy.

```sh
docker compose -f deploy/compose.yml --env-file deploy/.env stop api
docker compose -f deploy/compose.yml --env-file deploy/.env run --rm --no-deps \
  -e MEDVAULT_CONFIRM_RESTORE=yes \
  -v medvault_api_data:/app/frontend/server/data:rw \
  backup restore /backups/SELECTED_BACKUP.mvb
docker compose -f deploy/compose.yml --env-file deploy/.env run --rm --no-deps \
  --entrypoint node api scripts/verify-audit.cjs
docker compose -f deploy/compose.yml --env-file deploy/.env start api
curl --fail https://YOUR_CLINIC_DOMAIN/api/health
```

The extra restore volume changes the maintenance container's database mount from read-only to writable; the API stays stopped throughout verification. Confirm `audit.valid` is true, compare the restored head with retained checkpoints for the chosen backup time, and review representative patient/visit records after signing in. Revoke sessions following incident recovery by rotating the JWT secret, then recreate the API container. Rotation of the JWT secret does not change the medical encryption key.

`restart: unless-stopped` restarts API/NGINX after process or host failures. A failed health check is visible in Compose but does not itself trigger Docker's restart policy. Monitor unhealthy containers and investigate before restarting. Never use `docker compose down -v` during recovery: it deletes the database volume.

## Host acceptance checks

Run these against a test deployment from a separate authorized machine:

```sh
nmap -Pn -p 22,80,443,2222,3000,5432 YOUR_SERVER
curl -I http://YOUR_CLINIC_DOMAIN
openssl s_client -connect YOUR_CLINIC_DOMAIN:443 -servername YOUR_CLINIC_DOMAIN -tls1_3
```

Only 80, 443 and 2222 should be reachable; 3000 and 5432 should be closed/filtered. Port 5432 has no service because PostgreSQL is deferred. Verify a valid certificate chain, HTTP-to-HTTPS redirect, refusal of TLS 1.2, 429 responses under rate limiting, a one-hour Fail2ban ban, and successful recovery after `docker compose restart api`. Run OWASP ZAP against a staging copy with synthetic data and staff accounts and triage its findings. These live Linux, network, TLS and scanner checks require the target host; they have not been run on this Windows workspace.
