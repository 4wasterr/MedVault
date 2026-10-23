import { createContext, useContext, useRef, useState } from 'react';
import { draftKey, readDraft, writeDraft } from './draftStorage';

export const DraftScope = createContext('signup');
function storage() { try { return window.localStorage; } catch { return null; } }

// Write in the input handler so even an immediate unmount or reload keeps the last keystroke.
export function useDraftState(name, initial) {
  const scope = useContext(DraftScope);
  const key = draftKey(scope, name);
  const restore = () => {
    const fallback = typeof initial === 'function' ? initial() : initial;
    const saved = readDraft(storage(), key, fallback);
    return saved && fallback && !Array.isArray(saved) && typeof saved === 'object' && typeof fallback === 'object'
      ? { ...fallback, ...saved } : saved;
  };
  const [state, setValue] = useState(() => ({ key, value: restore() }));
  const value = state.key === key ? state.value : restore();
  const current = useRef({ key, value });
  if (state.key !== key) {
    setValue({ key, value });
  }
  const [storageFailed, setStorageFailed] = useState(false);
  const update = next => {
    const previous = current.current.key === key ? current.current.value : value;
    const updated = typeof next === 'function' ? next(previous) : next;
    current.current = { key, value: updated };
    setValue({ key, value: updated });
    const failed = !writeDraft(storage(), key, updated);
    setStorageFailed(failed);
    if (failed) window.dispatchEvent(new Event('medvault-draft-storage-failed'));
  };
  return [value, update, storageFailed];
}
