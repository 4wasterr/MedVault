import { draftKey, readDraft, writeDraft } from './draftStorage.js';

let pendingActions = 0;
export function startCriticalAction() { pendingActions += 1; }
export function finishCriticalAction() { pendingActions = Math.max(0, pendingActions - 1); }
export function criticalActionsPending() { return pendingActions > 0; }
const memory = new Map();
export function formBlockers(scope, storage) {
  return memory.get(scope) || readDraft(storage, draftKey(scope, 'form-errors'), {});
}
export function setFormBlocker(scope, key, message, storage) {
  const blockers = { ...formBlockers(scope, storage) };
  if (message) blockers[key] = message;
  else delete blockers[key];
  memory.set(scope, blockers);
  writeDraft(storage, draftKey(scope, 'form-errors'), blockers);
}
export function firstFormBlocker(scope, storage) {
  const entry = Object.entries(formBlockers(scope, storage))[0];
  return entry ? `${entry[0]}: ${entry[1]}` : '';
}
