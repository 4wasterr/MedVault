import { applyChanges, changesBetween } from './sharedState.js';

export function recoverRejectedSave(base, submitted, pending, serverState = null) {
  // Capture user edits before rebasing: server-only differences must never turn
  // an unchanged rejected payload into an automatic retry loop.
  const hasNewerEdits = changesBetween(submitted, pending).length > 0;
  return {
    hasNewerEdits,
    state: serverState ? applyChanges(serverState, changesBetween(base, pending)) : pending,
  };
}
