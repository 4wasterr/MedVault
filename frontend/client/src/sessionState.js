const dismissalKey = 'medvault:session-dismissed';
let dismissed = false;
let pendingLogout;

export function waitForLogout() { return pendingLogout; }

export function endSession(logout) {
  const request = Promise.resolve().then(logout);
  const completion = request.catch(() => {});
  pendingLogout = completion;
  completion.then(() => { if (pendingLogout === completion) pendingLogout = undefined; });
  return request;
}

export function isSessionDismissed() {
  try { return dismissed || window.sessionStorage.getItem(dismissalKey) === 'true'; }
  catch { return dismissed; }
}

export function dismissSession() {
  dismissed = true;
  try { window.sessionStorage.setItem(dismissalKey, 'true'); } catch { /* In-memory sign-out still applies. */ }
}

export function resumeSession() {
  dismissed = false;
  try { window.sessionStorage.removeItem(dismissalKey); } catch { /* Storage can be disabled. */ }
}
