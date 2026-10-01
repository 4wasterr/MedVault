import React, { Component, useEffect, useRef, useState } from 'react';
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
  return ['patients', 'appointments', 'schedules', 'users', 'doctors'].includes(view) ? view : 'dashboard';
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUsername, setCurrentUsername] = useState(null);
  const userRef = useRef(null);
  const [booting, setBooting] = useState(true);
  const [startupError, setStartupError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
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
  const flushRef = useRef(null);
  const retryRef = useRef(null);

  const installState = (state) => {
    syncedRef.current = state;
    recordsRef.current = state;
    setRecords(state);
  };

  const flush = async () => {
    if (savingRef.current || !userRef.current) return;
    const base = syncedRef.current;
    const submitted = recordsRef.current;
    const changes = changesBetween(base, submitted);
    if (!changes.length) return;
    savingRef.current = true;
    let retry = false;
    try {
      const serverState = await api('changes', { method: 'POST', body: JSON.stringify({ changes }) });
      if (!userRef.current) return;
      const newerChanges = changesBetween(submitted, recordsRef.current);
      syncedRef.current = serverState;
      const merged = applyChanges(serverState, newerChanges);
      recordsRef.current = merged;
      setRecords(merged);
      setSyncMessage('');
    } catch (error) {
      if (error.status === 401) {
        userRef.current = null;
        setCurrentUser(null);
        setCurrentUsername(null);
        setSyncMessage('Your session expired. Sign in again.');
      } else if (error.status === 409 && error.state) {
        installState(error.state);
        setSyncMessage('Another staff member changed a record. The latest version is shown; review and save your edit again.');
      } else if (error.status) {
        try { installState(await api('state')); } catch { retry = true; }
        setSyncMessage(error.message);
      } else {
        setSyncMessage('Connection lost. Changes are pending and will be retried.');
        retry = true;
      }
    } finally {
      savingRef.current = false;
      if (retry) {
        clearTimeout(retryRef.current);
        retryRef.current = setTimeout(() => flushRef.current?.(), 4000);
      } else if (changesBetween(syncedRef.current, recordsRef.current).length) {
        queueMicrotask(() => flushRef.current?.());
      }
    }
  };
  useEffect(() => { flushRef.current = flush; });

  const updateCollection = (collection, updater) => {
    const previous = recordsRef.current;
    const value = typeof updater === 'function' ? updater(previous[collection]) : updater;
    if (value === previous[collection]) return;
    const next = { ...previous, [collection]: value };
    recordsRef.current = next;
    setRecords(next);
    queueMicrotask(() => flushRef.current?.());
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await api('session');
        const state = session.role === 'Super Admin' ? emptyState() : await api('state');
        if (cancelled) return;
        userRef.current = session.role;
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
    const poll = setInterval(async () => {
      if (savingRef.current || changesBetween(syncedRef.current, recordsRef.current).length) return;
      try {
        const state = await api('state');
        if (!savingRef.current && !changesBetween(syncedRef.current, recordsRef.current).length) installState(state);
      } catch (error) {
        if (error.status === 401) {
          userRef.current = null;
          setCurrentUser(null);
          setCurrentUsername(null);
          setSyncMessage('Your session expired. Sign in again.');
        }
      }
    }, 4000);
    return () => clearInterval(poll);
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
      userRef.current = role;
      setCurrentUser(role);
      setCurrentUsername(username);
      installState(state);
      setSyncMessage('');
      handleNavigate('dashboard');
    } catch (error) {
      setStartupError(error.message);
    } finally {
      setBooting(false);
    }
  };

  const handleLogout = async () => {
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
    installState(emptyState());
    setCurrentView('dashboard');
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'login');
    window.history.replaceState({}, '', url);
  };

  const importBrowserRecords = async () => {
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
      installState(imported);
      for (const key of ['medvault_patients', 'medvault_appointments', 'medvault_schedules']) localStorage.removeItem(key);
      setLegacyAvailable(false);
      setSyncMessage('Browser records imported into the shared server.');
    } catch (error) {
      setSyncMessage(error.message || 'Unable to import browser records.');
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
      <span>Records from the previous browser-only version are available here. Importing replaces untouched demo data on the server.</span>
      <button type="button" disabled={importingLegacy} onClick={importBrowserRecords}>
        {importingLegacy ? 'Importing…' : 'Import Browser Records'}
      </button>
      <button type="button" onClick={() => setLegacyAvailable(false)} aria-label="Dismiss import option">×</button>
    </div>}
    {syncMessage && <div className="medvault-sync-alert" role="alert">{syncMessage}
      <button type="button" onClick={() => setSyncMessage('')} aria-label="Dismiss message">×</button>
    </div>}
    {!currentUser ? <Login onLoginSuccess={handleLogin} />
      : currentUser === 'Super Admin' ? <AdminDashboard view={['users', 'doctors'].includes(currentView) ? currentView : 'dashboard'} onNavigate={handleNavigate} onLogout={handleLogout} />
      : isMedicalSecretary && currentView === 'schedules' ? <MedSecDoctorSchedules {...sharedProps} />
        : currentView === 'patients' ? <PatientRecords {...sharedProps}
          key={isMedicalSecretary ? `${patientTarget.id || 'list'}-${patientTarget.tab}` : 'reception'}
          selectedPatientId={patientTarget.id} initialTab={patientTarget.tab} />
          : currentView === 'appointments' ? <Appointments {...sharedProps} />
            : <Dashboard {...sharedProps} receptionistName={currentUser} />}
  </ErrorBoundary>;
}
