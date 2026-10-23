import { isDemo, demoDraftPrefix } from './demoMode.js';

const PREFIX = isDemo ? demoDraftPrefix : 'medvault:draft:v1:';
const secrets = new Set(['password', 'confirmPassword', 'newPassword', 'currentPassword', 'temporaryPassword', 'token']);
export const draftKey = (scope, name) => `${PREFIX}${encodeURIComponent(scope)}:${encodeURIComponent(name)}`;
export function readDraft(storage, key, fallback) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return fallback;
    const saved = JSON.parse(raw);
    return saved.version === 1 && saved.value !== undefined && (fallback === null || typeof saved.value === typeof fallback) ? saved.value : fallback;
  } catch { return fallback; }
}
export function writeDraft(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify({ version: 1, value }, (name, item) => secrets.has(name) ? undefined : item));
    return Boolean(storage);
  } catch { return false; }
}
