# Audit Logs and flow review

Reviewed on October 11, 2026. The existing Super Admin, Receptionist, and Medical Secretary roles are retained. Storage remains SQLite.

## Using the module

Sign in as a Super Admin and select **Audit Logs** in the sidebar or dashboard shortcut. The grid shows date and time, username, role, module, action, and record or page ID. Search, combine filters, choose a date range, sort columns, and use the page controls to review older entries. Dates appear in the browser's local time; date filters include the entire selected end date. **View Details** opens a plain-language description. The grid refreshes every ten seconds and has loading, empty, and error states.

Entries are read-only. The database rejects log updates and deletions and verifies the hash chain on startup. Activity includes accounts that are later deactivated and attempted sign-ins from unregistered usernames. Passwords and medical snapshots are excluded from the audit response. Summaries identify affected field groups rather than medical values.

## Recorded actions

- Successful sign-ins, sign-outs, failed sign-ins, account lockouts, blocked or denied sign-ins, and idle session expiration when detected.
- Module navigation and saved patient or appointment section views. The actor comes from the authenticated server session; the browser cannot submit a different actor or arbitrary action. New records are logged as create actions.
- Registration, approval, rejection, account creation, profile/role/status changes, and explicit password resets.
- Doctor profiles and assignments, including references updated after a doctor rename.
- Patient, appointment, schedule, visit-history, and legacy-import changes, including cascading deletion of saved visits.
- Authenticated requests rejected by the checked role permissions, mutation validation, booking conflicts, or stale-record checks. Rejected entries identify the request route and HTTP status.

Successful changes and their audit entries commit together. A rolled-back save leaves no successful-change entries. Polling, session keepalive checks, and audit-grid reads do not generate view entries. The host request log continues to record HTTP requests, including failures before authentication. The module records meaningful application actions rather than every keystroke or request. Unrecorded historical actions cannot be reconstructed.

## Corrected flow gaps

1. **No usable admin audit history:** added the grid and replaced the latest-100-only endpoint with pagination, filters, sorting, and indexed lookups.
2. **Missing action visibility:** added module and section views, denied access, rejected changes, blocked sign-ins, password resets, and visit deletion entries.
3. **Approval bypass:** decisions now apply only to pending or previously declined registrations. Changes to existing staff access use account management and its assignment and session checks.
4. **Receptionist progress bypass:** the server now blocks clinical patient status transitions through direct requests and rejects unsupported new booking states. It also rejects blank patient names.
5. **Patient/booking details drifting apart:** receptionist personal edits now submit matching linked-booking updates in the same queued change set. Doctor filters use managed profiles and saved record references.
6. **Premature save confirmation:** a shared status shows saving, then confirms completion after the server responds. Patient-record messages distinguish submission from confirmed persistence.
7. **Old responses after changing sessions:** save, polling, activity, and browser-import responses are checked against the session that started them before applying data or signing a user out.
8. **Missing record links and misleading choices:** dashboard booking details link to the matching patient profile. The patient screen honors that target. Appointment editing preserves statuses the receptionist cannot change; cancellation uses the dedicated history-preserving flow.
9. **Production demo doctors:** fresh production databases no longer receive sample doctors. Development demo profiles remain available and existing profiles are retained.

## Verification and remaining checks

The backend suite includes `audit.test.js`: all-role visibility, denied access, actor spoofing attempts, polling suppression, more than 100 entries, combined filters, UTC date bounds, malicious query parameters, rolled-back transactions, safe clinical summaries, visit deletion, password-reset revocation, deactivated-account decisions, and receptionist status bypasses. Existing workflow, security, migration, production, and backup tests are also run, with frontend tests, build, and lint.

Final results: **23 backend tests passed, 2 frontend tests passed, production build passed, and lint passed without warnings for the changed screens.** `git diff --check` also passed. Test databases were isolated from the installation database.

A live visual check could not run because this session has no connected browser and the in-app browser is unavailable. Grid layout, keyboard focus, small-screen scrolling, browser-local date conversion, and the complete click-through journey still need visual acceptance. Receptionist notification panels still contain demo notices rather than notices generated from saved activity; they should not be treated as a live alert history. The audit grid uses server records.

Ubuntu HTTPS, firewall, SSH, Fail2ban, container, and backup-schedule activation still require the host checks in [deploy/README.md](../deploy/README.md). These local checks do not establish that a deployed system has no remaining gaps.
