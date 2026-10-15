# Security scope and assurance

## Approved scope

The supplied `requirements.pdf` is implemented using the current Super Admin, Receptionist and Medical Secretary roles. SQLite remains the database, as requested; PostgreSQL setup and migration are deferred. The application protections are active in the code. Ubuntu, NGINX, Docker, UFW, SSH, Fail2ban and cron configurations are supplied in `deploy/`, with activation and acceptance steps in [the deployment guide](../deploy/README.md).

Receptionist Medical Info displays the latest saved secretary medical history and consultation values, falls back to legacy stored medical fields, and leaves absent values blank. New/Past Patient badges reflect saved clinical details or visit history; scheduled bookings alone do not make a patient past.

## Boundary and assets

Super Admin now has a paginated, filterable **Audit Logs** grid for all accounts. The action coverage, corrected workflow gaps, and remaining acceptance checks are documented in [AUDIT_LOGS.md](AUDIT_LOGS.md). Clinical snapshots remain excluded from the admin audit API.

| Component | Boundary | Assets and priority |
| --- | --- | --- |
| React frontend | Browser to NGINX HTTPS 443; HTTP 80 redirects | Displayed patient information and authenticated sessions: critical |
| Node.js API | Docker network, port 3000, no public binding | Authorization, encryption, workflow transactions: critical |
| SQLite storage | Private persistent file volume; no TCP listener | EHR, medical history, consultations, visits, credentials, audits: critical |
| Secret files | Individual read-only Docker secret mounts | Encryption, signing and backup keys, bootstrap credentials: critical |
| Ubuntu host / Docker | Management through RSA-key SSH port 2222 | Host, volumes, runtime, journal and backup files: critical |
| NGINX / host configuration | Administrator-controlled deployment files | TLS certificate, rate limits, firewall and SSH policy: high |

Local development uses loopback HTTP port 5000 plus Vite and synthetic demo accounts. Production rejects API requests without trusted HTTPS forwarding and requires explicit encryption/JWT secrets and a strong administrator password. The API must remain private to NGINX because it trusts that single proxy.

## CIA baseline

| Module | Confidentiality target | Integrity target | Availability target |
| --- | --- | --- | --- |
| Authentication | HttpOnly, Strict, Secure production cookies; salted bcrypt | Signed JWT and current server session/account checks | Five-failure lock expires after 15 minutes |
| Patient and visit records | Authorized staff; encrypted medical and identifying fields | Parameterized SQL, sanitized writes, atomic transactions and stale-update rejection | Persistent SQLite WAL, recovery from consistent encrypted snapshots |
| Bookings and schedules | Staff access; encrypted patient-identifying values | Existing booking conflict and doctor-assignment rules | Shared polling and retained cancelled booking history |
| Staff and doctor management | Super Admin only; hashes excluded from API responses | Approved role values, revoked sessions on access changes, audited mutations | Persistent approved accounts and doctor profiles |
| Audit and monitoring | Clinical snapshots encrypted; logs omit payloads and credentials | SHA-256 chain, append-only triggers and startup validation | Committed events in host journal and independently retained checkpoints |
| Backup and keys | AES-256-GCM encrypted snapshots; restricted files | Authentication tag, SQLite and audit integrity checks before replacement | Daily schedule, off-host copy, restore drill; target RPO 24 hours and RTO 60 minutes |

The recovery targets are operational acceptance targets, not measured service guarantees. SQLite remains a single-host database; this change does not add multi-host failover.

## Access control matrix

| Operation | Super Admin | Receptionist | Medical Secretary |
| --- | --- | --- | --- |
| Staff registration approval, creation, role changes, deactivation | Allow | Deny | Deny |
| Doctor profile and secretary assignments | Allow | Deny | Deny |
| Multi-Factor Authentication (TOTP / Backup codes) | Enforced | Supported | Supported |
| Password reset & single-use expiring token verification | Allow (self/admin) | Allow (self) | Allow (self) |
| Aggregate dashboard counts | Allow | Staff dashboard | Staff dashboard |
| Patient and clinical record read | Deny | Minimum Necessary (demographics & booking intake; clinical notes redacted) | Full clinical access |
| Patient duplicate review and merge | Deny | Allow | Allow |
| Patient demographics and booking management | Deny | Allow (validated rules & 30-min slots) | Allow |
| Clinical history, consultation, vitals, notes, visit progress | Deny | Deny write | Allow |
| Doctor schedule changes | Deny | Deny | Allow for assigned doctors; unassigned doctors remain shared |
| Import old browser records | Deny | Deny | Strict validation (schema allowlist & invariant checks) |
| Incremental state synchronization (`/api/sync`) | Deny | Allow (role-filtered delta) | Allow (role-filtered delta) |
| Security health and audit metadata | Allow | Deny | Deny |

All private routes verify the signed JWT, stored session, MFA status, and current approved account before applying the role rules. Public endpoints are limited to health, CSRF bootstrap, sign-in, MFA login gate, password recovery verification, and pending staff registration. Invalid routes return 404. Minimum necessary PHI access is enforced: receptionists receive redacted demographic views (`?minimum=1`) omitting detailed clinical history and consultation notes, while medical secretaries retain clinical access.

## Application controls

- Multi-Factor Authentication (MFA): Supports RFC 6238 time-based one-time passwords (TOTP, HMAC-SHA1, 30s window, 6 digits) and pre-generated 8-character single-use emergency backup codes. MFA is mandatory for Super Admin operations and available to all staff roles. Login generates an ephemeral verification token (`mfaRequired: true`) requiring TOTP/backup code validation before session issuance.
- Password Recovery: Replaces client-side previews with cryptographically secure, expiring (15-minute TTL) single-use 6-digit numeric verification tokens. All recovery endpoints return generic anti-enumeration messages. Failed recovery attempts are rate-limited to 5 per IP/email window before cooldown. Completed resets update the bcrypt password hash and invalidate all active user sessions immediately.
- Passwords use bcrypt cost 12 with a random salt. New passwords require at least eight characters, a letter and a number, with a maximum of 72 UTF-8 bytes. Production bootstrap passwords require at least twelve characters. Older scrypt hashes upgrade after successful sign-in.
- Sessions use HS256 JWTs with issuer, audience, subject, role, unique ID and expiry. Only token hashes are persisted. Default limits are eight hours absolute and thirty minutes idle. Polling never extends idle time; trusted keyboard/pointer activity refreshes an active session at most once a minute. Access changes and logout revoke sessions.
- Five failed sign-ins lock the normalized username for fifteen minutes across IP changes. NGINX limits login/register traffic; unknown accounts use a dummy bcrypt comparison. Failed attempts and access refusals are logged.
- Booking & Invariant Rules: The API enforces strict operational constraints: rejects past-dated bookings, enforces clinic operating hours (default 08:00–17:00 on weekdays when doctor schedule is absent), restricts appointments to 30-minute increments, and enforces a one-way appointment status lifecycle (`Open` -> `Confirmed` -> `Checked-In` / `Waiting` -> `In Consultation` -> `Completed` / `Cancelled`). Cancelled and Completed appointments cannot be reopened.
- Relational Schema & Duplicate Prevention: Domain entities are normalized into dedicated relational tables (`patients_rel`, `appointments_rel`, `schedules_rel`) with foreign keys, indexes, and automated sync. Patient duplicate detection flags normalized name, date-of-birth, and contact collisions, requiring explicit confirmation or resolution via the `/api/patients/merge` endpoint.
- AES-256-GCM uses independent random 96-bit IVs, authentication tags and record/field-path associated data. Sensitive clinical groups and identifying patient fields are encrypted before SQLite writes, including audit snapshots. Existing plaintext records and legacy audit snapshots migrate in a transaction at startup. Workflow metadata such as record IDs, statuses and appointment times remains queryable. This is field encryption, not encryption of every database byte.
- SQL values use prepared statements. Incoming stored text is stripped of markup and disallowed control characters; nested/deep and oversized requests are rejected. Change payloads are strictly validated against field allowlists to prevent schema drift. React escapes rendered text; CSP limits scripts to the same origin.
- JSON mutations require a CSRF token matching a Strict HttpOnly cookie and reject hostile Origin/cross-site fetch headers. HTTPS production cookies add Secure; Helmet supplies CSP, HSTS, frame and MIME protections. Responses containing API data are not cached.
- Audit entries hash their metadata, encrypted snapshots and previous entry hash. SQLite triggers reject UPDATE/DELETE. Writes and their audits commit together; the chain is verified on startup. Admin endpoints expose verification and metadata without clinical audit payloads. Committed audit metadata and checkpoints are emitted to the host journal.

SHA-256 chaining is tamper evidence, not a digital signature by each human editor. It does not establish independent non-repudiation against a host administrator who can replace the database and local logs. Preserve committed checkpoints in a protected off-host log service to support stronger accountability. No ISO or CIS certification is claimed.

## Framework and risk assessment

This assessment uses OWASP Top 10 (2021) and OWASP API Security Top 10 for injection, access control, configuration and authentication risks; CIS Ubuntu controls for the supplied host configuration; and NIST CSF functions for inventory, protection, detection, response and recovery. It is a scoped implementation and test plan, not an exhaustive compliance audit.

Likelihood and impact use 1 (low), 2 (moderate), 3 (high). Risk = likelihood × impact: 1–2 Low, 3–4 Medium, 6–9 High. Ratings below describe untreated risks; residual risk must be reviewed on the deployed clinic host.

| Threat | Likelihood | Impact | Score / priority | Treatment |
| --- | --- | --- | --- | --- |
| SQL injection | 2 | 3 | 6 / High | Prepared statements; malicious login/workflow tests |
| Stored XSS / malicious input | 2 | 3 | 6 / High | Sanitization, escaped React output, CSP |
| Broken object/function authorization | 3 | 3 | 9 / High | Per-route role checks, clinical-field restrictions, doctor ownership |
| Brute force / credential theft | 3 | 3 | 9 / High | Salted bcrypt, lockout, rate limits, Fail2ban |
| CSRF / session forgery | 2 | 3 | 6 / High | CSRF/origin checks, signed and revocable cookies |
| EHR disclosure from copied storage | 2 | 3 | 6 / High | Field encryption and separate protected keys |
| Exposed database or API port | 2 | 3 | 6 / High | No database listener; API not published; external scan |
| Audit alteration | 2 | 3 | 6 / High | Hash chain, append-only triggers, off-host checkpoints |
| Host compromise / SSH abuse | 2 | 3 | 6 / High | Key-only SSH, root disabled, non-root limited containers |
| Request flood / resource exhaustion | 2 | 2 | 4 / Medium | NGINX rates/body limits; runtime limits |
| Database loss / failed recovery | 2 | 3 | 6 / High | Encrypted daily backup, authenticated restore, key archive |
| Secret loss or disclosure | 2 | 3 | 6 / High | Independent secret files, Git exclusions, protected off-host archive |

## Risk-to-control test traceability

| Risk / requirement | Evidence / procedure | Acceptance criterion | Verification |
| --- | --- | --- | --- |
| SQLi | `security.test.js`: injected username; workflow parameterization review | No unauthorized sign-in or injected statement | Automated pass |
| XSS | Script payload in a clinical note and response CSP | Stored note is clean; CSP restricts scripts | Automated pass |
| RBAC / BOLA | `index.test.js`, `security.test.js`: lower-role admin and clinical writes, doctor assignment | Denied with 403; records unchanged | Automated pass |
| Session forgery | Altered JWT / account role changes | 401; revoked sessions cannot read records | Automated pass |
| Idle sessions / cookie policy | Backdated last activity, background poll, `production.test.js` | Idle session rejected; Secure/HttpOnly/Strict in production | Automated pass |
| CSRF | Missing token and hostile Origin | Mutation rejected with 403 | Automated pass |
| Brute force | Five failures followed by a sixth request from another IP | Lock returns 429 and Retry-After | Automated pass |
| EHR confidentiality and integrity | Read raw SQLite JSON and alter a GCM tag | No plaintext diagnosis; tampered ciphertext cannot decrypt | Automated pass |
| Audit immutability / tampering | UPDATE/DELETE attempts; simulate privileged alteration | Triggers deny edits; altered chain fails verification | Automated pass |
| Service restart | Reopen database and keys after stopping API | Clinical values and valid audit chain retained | Automated pass |
| In-flight request isolation | Attempt a delayed write from a completed request context | No later transaction is changed | Automated pass |
| Production startup | Missing key; fresh production database | Missing key fails closed; no demo EHR/accounts created | Automated pass |
| Existing installation upgrade | `migration.test.js`: plaintext history/audits, embedded visits, scrypt staff account, incorrect encryption key | Data retained and encrypted; existing sign-in works; wrong key fails closed | Automated pass |
| Backup recovery | `backup.test.js`: WAL record, wrong key, damaged backup, successful restore | No plaintext; failed restore preserves DB; valid restore preserves expected records and prior snapshot | Automated pass |
| API performance | `npm run test:load --prefix frontend/server` | 100% success, local fixture p95 < 500 ms at 20 concurrent clients | Measured below |
| TLS / exposure / firewall | Separate-host nmap, curl and openssl checks in deployment guide | Only 80/443/2222 reachable; valid TLS 1.3 and redirect | Configuration supplied; host test pending |
| Intrusion prevention | Five staging failures and Fail2ban status/firewall inspection | Source IP blocked for at least one hour | Configuration supplied; host test pending |
| Container fault tolerance | Restart API/host and inspect health/records | Service returns healthy with persistent data | Configured restart policy; host drill pending |
| Vulnerability scan | OWASP ZAP staging scan and dependency audit | No unresolved high/critical findings | Dependency audit clean; ZAP host scan pending |
| Daily recovery objectives | Cron completion, off-host copies, timed restore drill | RPO ≤24 h; RTO ≤60 min | Scripts supplied; operational drill pending |

## Measured local results

On 2026-10-11, Node.js v24.16.0 on this Windows workspace, the isolated synthetic SQLite load fixture completed 200/200 state reads with 20 concurrent clients: p50 177.38 ms, p95 280.64 ms, p99 288.29 ms, 106.26 requests/second. These figures measure the local application and synthetic fixture, excluding production TLS, remote networking and a large clinic database. The harness writes fresh measurements to ignored `output/security/load-results.json`. Re-run against a staging host with representative synthetic records before setting production capacity targets.

Security metrics are the rejection and integrity checks above. The backend suite passes 31 tests (including gap validations for MFA, password resets, minimum-necessary PHI, relational sync, and booking rules); the frontend suite passes 21 tests across booking rules, registration policies, recovery flow, accessibility, multi-user concurrency, and state synchronization; build, lint and manual browser-origin sign-in through Vite also pass. Reliability is verified locally by reopening encrypted records and by backup/restore; actual container/host restart duration and RTO remain to be measured. Dependency audits reported zero known vulnerabilities after updating the server lockfile and the client `source-map-js` patch; this is a point-in-time check.

## Run assurance checks

```sh
npm test --prefix frontend/server
npm test --prefix frontend/client
npm run lint --prefix frontend/client
npm run build
npm audit --prefix frontend/server
npm audit --prefix frontend/client
npm run test:load --prefix frontend/server
npm run verify:audit --prefix frontend/server
```

Tests and the default load test use isolated temporary databases. `verify:audit` checks the configured installation and may perform the normal startup migration; preserve the existing database and keys before first upgrade. Never run the load harness against a clinic service without scheduling the test and using an authorized test account. External mode uses `MEDVAULT_LOAD_URL`, `MEDVAULT_LOAD_USERNAME`, `MEDVAULT_LOAD_PASSWORD`, optional request/concurrency limits, and read-only state requests after sign-in.

Implementation references: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [Node SQLite backup API](https://nodejs.org/docs/latest-v24.x/api/sqlite.html#sqlitebackupsourceDb-path-options), and [Docker Compose secrets](https://docs.docker.com/reference/compose-file/secrets/).
