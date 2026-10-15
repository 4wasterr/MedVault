import React, { Component, useCallback, useEffect, useRef, useState } from 'react';
import Login from '../../pages/receptionist/login';
import ReceptionistDashboard from '../../pages/receptionist/receptionistDashboard';
import PatientsModuleReceptionist from '../../pages/receptionist/patientsModuleReceptionist';
import Appointment from '../../pages/receptionist/appointment';
import MedSecDashboard from '../../pages/medical secretary/MedSecDashboard';
import MedSecPatientRecords from '../../pages/medical secretary/MedSecPatientRecords';
import MedSecAppointment from '../../pages/medical secretary/MedSecAppointment';
import MedSecDoctorSchedules from '../../pages/medical secretary/MedSecDoctorSchedules';
import AdminDashboard from '../../pages/super admin/AdminDashboard';
import { api, applyChanges, changesBetween, emptyState } from './sharedState';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) { console.error('MedVault render error:', error, info); }

  render() {
    if (!this.state.error) return this.props.children;
    return <div style={{ padding: 40, fontFamily: 'system-ui' }}>
      <h2>Unable to display this page</h2>
      <p>{this.state.error.message}</p>
      <button type="button" onClick={() => window.location.reload()}>Reload MedVault</button>
    </div>;
  }
}

const initialView = () => {
  const view = new URLSearchParams(window.location.search).get('view');
  return ['patients', 'appointments', 'schedules', 'users', 'doctors', 'audit'].includes(view) ? view : 'dashboard';
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUsername, setCurrentUsername] = useState(null);
  const userRef = useRef(null);
  const [booting, setBooting] = useState(true);
  const [startupError, setStartupError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [legacyAvailable, setLegacyAvailable] = useState(() => {
    try { return ['medvault_patients', 'medvault_appointments', 'medvault_schedules'].some((key) => localStorage.getItem(key)); }
    catch { return false; }
  });
  const [importingLegacy, setImportingLegacy] = useState(false);
  const [currentView, setCurrentView] = useState(initialView);
  const [patientTarget, setPatientTarget] = useState({ id: null, tab: 'personal' });
  const [records, setRecords] = useState(emptyState);
  const recordsRef = useRef(records);
  const syncedRef = useRef(records);
  const savingRef = useRef(false);
  const saveBlockedRef = useRef(false);
  const flushRef = useRef(null);
  const retryRef = useRef(null);
  const [saveBlocked, setSaveBlocked] = useState(false);

  const markSaveBlocked = (value) => {
    saveBlockedRef.current = value;
    setSaveBlocked(value);
  };

  const installState = (state) => {
    syncedRef.current = state;
    recordsRef.current = state;
    setRecords(state);
    markSaveBlocked(false);
  };

  const flush = async () => {
    if (savingRef.current || !userRef.current) return;
    const base = syncedRef.current;
    const submitted = recordsRef.current;
    const changes = changesBetween(base, submitted);
    if (!changes.length) return;
    const session = userRef.current;
    savingRef.current = true;
    setSaveStatus('Saving changes...');
    let retry = false;
    let blocked = false;
    try {
      const serverState = await api('changes', { method: 'POST', body: JSON.stringify({ changes }) });
      if (userRef.current !== session) return;
      const newerChanges = changesBetween(submitted, recordsRef.current);
      syncedRef.current = serverState;
      const merged = applyChanges(serverState, newerChanges);
      recordsRef.current = merged;
      setRecords(merged);
      markSaveBlocked(false);
      setSyncMessage('');
      setSaveStatus('Changes saved to the shared server.');
    } catch (error) {
      if (userRef.current !== session) return;
      setSaveStatus('');
      if (error.status === 401) {
        userRef.current = null;
        setCurrentUser(null);
        setCurrentUsername(null);
        installState(emptyState());
        setSyncMessage('Your session expired. Sign in again.');
      } else if (error.status === 409 && error.state) {
        const pendingChanges = changesBetween(base, recordsRef.current);
        syncedRef.current = error.state;
        const merged = applyChanges(error.state, pendingChanges);
        recordsRef.current = merged;
        setRecords(merged);
        blocked = true;
        markSaveBlocked(true);
        setSaveStatus('Changes need review.');
        setSyncMessage('Another staff member changed a record. Your draft is preserved; review it before saving again.');
      } else if (error.status) {
        blocked = true;
        markSaveBlocked(true);
        setSaveStatus('Changes need attention.');
        setSyncMessage(`${error.message} Your unsaved changes are still shown.`);
      } else {
        setSyncMessage('Connection lost. Changes are pending and will be retried.');
        retry = true;
      }
    } finally {
      savingRef.current = false;
      if (retry && userRef.current === session) {
        clearTimeout(retryRef.current);
        retryRef.current = setTimeout(() => flushRef.current?.(), 4000);
      } else if (!blocked && changesBetween(syncedRef.current, recordsRef.current).length) {
        queueMicrotask(() => flushRef.current?.());
      }
    }
  };
  useEffect(() => { flushRef.current = flush; });

  useEffect(() => {
    const warnAboutPendingChanges = (event) => {
      if (!savingRef.current && !changesBetween(syncedRef.current, recordsRef.current).length) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnAboutPendingChanges);
    return () => window.removeEventListener('beforeunload', warnAboutPendingChanges);
  }, []);

  const updateCollection = (collection, updater) => {
    const previous = recordsRef.current;
    const value = typeof updater === 'function' ? updater(previous[collection]) : updater;
    if (value === previous[collection]) return;
    const next = { ...previous, [collection]: value };
    recordsRef.current = next;
    setRecords(next);
    markSaveBlocked(false);
    setSaveStatus('Saving changes...');
    queueMicrotask(() => flushRef.current?.());
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await api('session');
        const state = session.role === 'Super Admin' ? emptyState() : await api('state');
        if (cancelled) return;
        userRef.current = { role: session.role, username: session.username };
        setCurrentUser(session.role);
        setCurrentUsername(session.username);
        installState(state);
        setStartupError('');
      } catch (error) {
        if (cancelled) return;
        if (error.status !== 401) setStartupError('Cannot reach the MedVault server. Start the server and reload this page.');
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; clearTimeout(retryRef.current); };
  }, []);

  useEffect(() => {
    if (!currentUser || currentUser === 'Super Admin' || booting) return undefined;
    const session = userRef.current;
    const poll = setInterval(async () => {
      if (savingRef.current || changesBetween(syncedRef.current, recordsRef.current).length) return;
      try {
        const state = await api('state', { headers: { 'X-MedVault-Background': '1' } });
        if (userRef.current === session && !savingRef.current && !changesBetween(syncedRef.current, recordsRef.current).length) installState(state);
      } catch (error) {
        if (userRef.current === session && error.status === 401) {
          userRef.current = null;
          setCurrentUser(null);
          setCurrentUsername(null);
          setSaveStatus('');
          installState(emptyState());
          setSyncMessage('Your session expired. Sign in again.');
        }
      }
    }, 4000);
    return () => clearInterval(poll);
  }, [currentUser, booting]);

  const recordView = useCallback(async (collection, recordId, section = '') => {
    if (collection !== 'modules' && !syncedRef.current[collection]?.some(record => record.id === recordId)) return;
    const session = userRef.current;
    if (!session) return;
    try { await api('activity', { method: 'POST', body: JSON.stringify({ collection, recordId, section }) }); }
    catch (error) {
      if (userRef.current !== session) return;
      if (error.status === 401) {
        userRef.current = null;
        setCurrentUser(null); setCurrentUsername(null);
        const state = emptyState(); syncedRef.current = state; recordsRef.current = state; setRecords(state);
        setSaveStatus('');
      }
      setSyncMessage(`Unable to record this activity: ${error.message}`);
    }
  }, []);
  const allowedViews = currentUser === 'Super Admin' ? ['dashboard', 'users', 'doctors', 'audit'] :
    currentUser === 'Medical Secretary' ? ['dashboard', 'patients', 'appointments', 'schedules'] : ['dashboard', 'patients', 'appointments'];
  const effectiveView = allowedViews.includes(currentView) ? currentView : 'dashboard';
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled && currentUser && !booting) void recordView('modules', effectiveView); });
    return () => { cancelled = true; };
  }, [currentUser, booting, effectiveView, recordView]);

  useEffect(() => {
    if (!currentUser || booting) return undefined;
    let active = true;
    const session = userRef.current;
    let lastTouch = Date.now();
    const checkSession = async (background) => {
      try { await api('session', { headers: background ? { 'X-MedVault-Background': '1' } : {} }); }
      catch (error) {
        if (active && userRef.current === session && error.status === 401) {
          userRef.current = null;
          setCurrentUser(null);
          setCurrentUsername(null);
          setSaveStatus('');
          installState(emptyState());
          setSyncMessage('Your session expired. Sign in again.');
        }
      }
    };
    const onActivity = (event) => {
      if (event.isTrusted && Date.now() - lastTouch >= 60_000) {
        lastTouch = Date.now();
        void checkSession(false);
      }
    };
    const timer = setInterval(() => void checkSession(true), 30_000);
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, [currentUser, booting]);

  useEffect(() => {
    const onBack = () => {
      setCurrentView(initialView());
      setPatientTarget({ id: null, tab: 'personal' });
    };
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, []);

  const handleNavigate = (view, target) => {
    if (view === 'patients') setPatientTarget(target?.patientId
      ? { id: target.patientId, tab: target.tab || 'personal' }
      : { id: null, tab: 'personal' });
    setCurrentView(view);
    const url = new URL(window.location.href);
    url.searchParams.set('view', view);
    window.history.pushState({ view }, '', url);
  };

  const handleLogin = async (role, username) => {
    setBooting(true);
    try {
      const state = role === 'Super Admin' ? emptyState() : await api('state');
      userRef.current = { role, username };
      setCurrentUser(role);
      setCurrentUsername(username);
      installState(state);
      setSyncMessage('');
      setSaveStatus('');
      handleNavigate('dashboard');
    } catch (error) {
      setStartupError(error.message);
    } finally {
      setBooting(false);
    }
  };

  const handleLogout = async () => {
    if (saveBlockedRef.current && changesBetween(syncedRef.current, recordsRef.current).length) {
      setSyncMessage('Review or correct the pending changes, then retry saving before signing out.');
      return;
    }
    const deadline = Date.now() + 10_000;
    while ((savingRef.current || changesBetween(syncedRef.current, recordsRef.current).length) && Date.now() < deadline) {
      if (!savingRef.current) await flushRef.current?.();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (savingRef.current || changesBetween(syncedRef.current, recordsRef.current).length) {
      setSyncMessage('Changes are still pending. Stay signed in until they finish saving.');
      return;
    }
    try {
      await api('logout', { method: 'POST' });
    } catch (error) {
      if (error.status !== 401) { setSyncMessage('Unable to sign out while the server is unavailable.'); return; }
    }
    userRef.current = null;
    setCurrentUser(null);
    setCurrentUsername(null);
    setSaveStatus('');
    installState(emptyState());
    setCurrentView('dashboard');
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'login');
    window.history.replaceState({}, '', url);
  };

  const importBrowserRecords = async () => {
    const session = userRef.current;
    setImportingLegacy(true);
    try {
      const read = (key, fallback) => {
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : fallback;
      };
      const imported = await api('import-legacy', { method: 'POST', body: JSON.stringify({
        patients: read('medvault_patients', recordsRef.current.patients),
        appointments: read('medvault_appointments', recordsRef.current.appointments),
        schedules: read('medvault_schedules', recordsRef.current.schedules),
      }) });
      if (userRef.current !== session) return;
      installState(imported);
      for (const key of ['medvault_patients', 'medvault_appointments', 'medvault_schedules']) localStorage.removeItem(key);
      setLegacyAvailable(false);
      setSyncMessage('Browser records imported into the shared server.');
    } catch (error) {
      if (userRef.current === session) setSyncMessage(error.message || 'Unable to import browser records.');
    } finally {
      setImportingLegacy(false);
    }
  };

  const isMedicalSecretary = currentUser === 'Medical Secretary';
  const Dashboard = isMedicalSecretary ? MedSecDashboard : ReceptionistDashboard;
  const PatientRecords = isMedicalSecretary ? MedSecPatientRecords : PatientsModuleReceptionist;
  const Appointments = isMedicalSecretary ? MedSecAppointment : Appointment;
  const sharedProps = {
    onNavigate: handleNavigate, onLogout: handleLogout,
    patients: records.patients, appointments: records.appointments, schedules: records.schedules, doctors: records.doctors,
    username: currentUsername,
    onRecordView: recordView,
    setPatients: (updater) => updateCollection('patients', updater),
    setAppointments: (updater) => updateCollection('appointments', updater),
    setSchedules: (updater) => updateCollection('schedules', updater),
  };

  if (booting) return <div className="medvault-loading" role="status">Loading MedVault…</div>;
  if (startupError) return <div className="medvault-loading" role="alert">
    <p>{startupError}</p><button type="button" onClick={() => window.location.reload()}>Retry</button>
  </div>;

  return <ErrorBoundary>
    {isMedicalSecretary && legacyAvailable && <div className="medvault-import-alert" role="status">
      <span>Records from the previous browser-only version are available here. Importing replaces shared records before clinical changes have been made.</span>
      <button type="button" disabled={importingLegacy} onClick={importBrowserRecords}>
        {importingLegacy ? 'Importing…' : 'Import Browser Records'}
      </button>
      <button type="button" onClick={() => setLegacyAvailable(false)} aria-label="Dismiss import option">×</button>
    </div>}
    {syncMessage && <div className="medvault-sync-alert" role="alert">{syncMessage}
      {saveBlocked && <button type="button" onClick={() => {
        markSaveBlocked(false);
        setSaveStatus('Saving changes...');
        queueMicrotask(() => flushRef.current?.());
      }}>Retry save</button>}
      <button type="button" onClick={() => setSyncMessage('')} aria-label="Dismiss message">×</button>
    </div>}
    {currentUser && saveStatus && <div className="medvault-save-status" role="status">{saveStatus}</div>}
    {!currentUser ? <Login onLoginSuccess={handleLogin} />
      : currentUser === 'Super Admin' ? <AdminDashboard view={effectiveView} onNavigate={handleNavigate} onLogout={handleLogout} />
      : isMedicalSecretary && effectiveView === 'schedules' ? <MedSecDoctorSchedules {...sharedProps} />
        : effectiveView === 'patients' ? <PatientRecords {...sharedProps}
          key={`${currentUser}-${patientTarget.id || 'list'}-${patientTarget.tab}`}
          selectedPatientId={patientTarget.id} initialTab={patientTarget.tab} />
          : effectiveView === 'appointments' ? <Appointments {...sharedProps} />
            : <Dashboard {...sharedProps} receptionistName={currentUser} />}
  </ErrorBoundary>;
}
