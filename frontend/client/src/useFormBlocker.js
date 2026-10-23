import { useContext, useEffect } from 'react';
import { DraftScope } from './useDraftState';
import { setFormBlocker } from './formStatus';

export function useFormBlocker(name, message) {
  const scope = useContext(DraftScope);
  useEffect(() => {
    let storage;
    try { storage = window.localStorage; } catch { /* In-memory protection still applies. */ }
    setFormBlocker(scope, name, message || '', storage);
    // Keep unresolved draft errors when the user navigates away from the form.
  }, [scope, name, message]);
}
