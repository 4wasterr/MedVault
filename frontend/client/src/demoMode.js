export const isDemo = typeof import.meta.env !== 'undefined' && import.meta.env.MODE === 'demo';
export const demoDraftPrefix = 'medvault:demo:draft:v1:';

// A fresh preview starts with fresh sample records and matching form drafts.
// Never touch drafts or records belonging to the connected application.
export function clearDemoDrafts() {
  try {
    const storage = window.localStorage;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) if (key?.startsWith(demoDraftPrefix)) storage.removeItem(key);
  } catch { /* The demo can still run in memory when browser storage is disabled. */ }
}
