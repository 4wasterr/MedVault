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
import { DraftScope } from './useDraftState';
import { draftKey, readDraft, writeDraft } from './draftStorage';
import { api, applyChanges, changesBetween, emptyState } from './sharedState';
import { isDemo } from './demoMode';
import { installFormFeedback } from './formFeedback';
import { dismissSession, endSession, isSessionDismissed, resumeSession } from './sessionState';
import { recoverRejectedSave } from './saveRecovery';
import { CurrentUserContext } from './currentUser';
import { stampChangedRecords } from '../../shared/recordOrdering.mjs';
import './formFeedback.css';
import './moduleLayout.css';

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
      {this.props.onLogout && <button type="button" onClick={this.props.onLogout}>Sign Out</button>}
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
  const [currentProfile, setCurrentProfile] = useState(null);
  const userRef = useRef(null);
  const [booting, setBooting] = useState(true);
  const [startupError, setStartupError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [legacyAvailable, setLegacyAvailable] = useState(() => {
    if (isDemo) return false;
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
  const saveControllerRef = useRef(null);
  const flushRef = useRef(null);
  const retryRef = useRef(null);
  const [draftStorageFailed, setDraftStorageFailed] = useState(false);
  useEffect(() => installFormFeedback(document), []);
  useEffect(() => {
    const failed = () => setDraftStorageFailed(true);
    window.addEventListener('medvault-draft-storage-failed', failed);
    return () => window.removeEventListener('medvault-draft-storage-failed', failed);
  }, []);

  const persistPending = (base, pending) => {
    const session = userRef.current;
    if (!session) return;
    try {
      if (!writeDraft(localStorage, draftKey(`${session.role}:${session.username}`, 'pending-changes'), changesBetween(base, pending))) setDraftStorageFailed(true);
    } catch { setDraftStorageFailed(true); }
  };

  const restorePending = (state, session) => {
    let changes = [];
    try { changes = readDraft(localStorage, draftKey(`${session.role}:${session.username}`, 'pending-changes'), []); }
    catch { setDraftStorageFailed(true); }
    if (!Array.isArray(changes)) return;
    const pending = changes.filter(change => {
      if (!['patients', 'appointments', 'schedules'].includes(change?.collection)) return false;
      const current = change.collection === 'schedules' ? state.schedules[change.id] : state[change.collection].find(item => item.id === change.id);
      return JSON.stringify(current || null) !== JSON.stringify(change.after);
    });
    if (!pending.length) return;
    const conflict = pending.some(change => {
      const current = change.collection === 'schedules' ? state.schedules[change.id] : state[change.collection].find(item => item.id === change.id);
      return JSON.stringify(current || null) !== JSON.stringify(change.before);
    });
    const merged = applyChanges(state, pending);
    recordsRef.current = merged;
    setRecords(merged);
    if (conflict) {
      setSyncMessage('Recovered changes conflict with newer server records. Review and correct the affected form before saving.');
    } else {
      setSyncMessage('Recovered pending changes from this device.');
      queueMicrotask(() => flushRef.current?.());
    }
  };

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
    const session = userRef.current;
    const controller = new AbortController();
    saveControllerRef.current = controller;
    savingRef.current = true;
    setSaveStatus('Saving changes...');
    let retry = false;
    let blocked = false;
    let newerEditsAfterRejection = false;
    try {
      const serverState = await api('changes', { method: 'POST', body: JSON.stringify({ changes }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      if (userRef.current !== session) return;
      const newerChanges = changesBetween(submitted, recordsRef.current);
      syncedRef.current = serverState;
      const merged = applyChanges(serverState, newerChanges);
      recordsRef.current = merged;
      setRecords(merged);
      persistPending(serverState, merged);
      setSyncMessage('');
      setSaveStatus(isDemo ? 'Changes saved for this preview. Refresh to reset.' : '');
    } catch (error) {
      if (userRef.current !== session) return;
      const recovery = recoverRejectedSave(base, submitted, recordsRef.current, error.status === 409 ? error.state : null);
      newerEditsAfterRejection = recovery.hasNewerEdits;
      setSaveStatus('');
      if (error.status === 401) {
        userRef.current = null;
        setCurrentUser(null);
        setCurrentUsername(null);
        installState(emptyState());
        setSyncMessage('Your session expired. Sign in again.');
      } else if (error.status === 409 && error.state) {
        syncedRef.current = error.state;
        const merged = recovery.state;
        recordsRef.current = merged;
        setRecords(merged);
        blocked = true;
        setSaveStatus('Changes need review.');
        setSyncMessage('Another staff member changed a record. Your draft is preserved; review it before saving again.');
      } else if (error.status && error.status < 500) {
        blocked = true;
        setSaveStatus('Changes need attention.');
        setSyncMessage(`${error.message} Your unsaved changes are still shown.`);
      } else {
        setSyncMessage('Connection lost. Changes are pending and will be retried.');
        retry = true;
      }
    } finally {
      if (saveControllerRef.current === controller) {
        saveControllerRef.current = null;
        savingRef.current = false;
        if (retry && userRef.current === session) {
          clearTimeout(retryRef.current);
          retryRef.current = setTimeout(() => flushRef.current?.(), 4000);
        } else if ((!blocked || newerEditsAfterRejection) && userRef.current === session && changesBetween(syncedRef.current, recordsRef.current).length) {
          queueMicrotask(() => flushRef.current?.());
        }
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
    let value = typeof updater === 'function' ? updater(previous[collection]) : updater;
    if (value === previous[collection]) return;
    if (['patients', 'appointments'].includes(collection)) value = stampChangedRecords(previous[collection], value);
    const next = { ...previous, [collection]: value };
    recordsRef.current = next;
    setRecords(next);
    persistPending(syncedRef.current, next);
    setSaveStatus('Saving changes...');
    queueMicrotask(() => flushRef.current?.());
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isSessionDismissed()) return;
        const session = await api('session');
        const state = session.role === 'Super Admin' ? emptyState() : await api('state');
        if (cancelled) return;
        userRef.current = { role: session.role, username: session.username };
        setCurrentUser(session.role);
        setCurrentUsername(session.username);
        setCurrentProfile(session);
        installState(state);
        restorePending(state, session);
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
      try {
        const profile = await api('session', { headers: background ? { 'X-MedVault-Background': '1' } : {} });
        if (active && userRef.current === session) setCurrentProfile(profile);
      }
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
    if (view === 'patients') {
      setPatientTarget(target?.patientId
        ? { id: target.patientId, tab: target.tab || 'personal' }
        : { id: null, tab: 'personal' });
    } else if (view === 'consultation') {
      setPatientTarget(target?.patientId
        ? { id: target.patientId, appointmentId: target.appointmentId || '' }
        : { id: null, appointmentId: '' });
    }
    setCurrentView(view);
    const url = new URL(window.location.href);
    url.searchParams.set('view', view);
    window.history.pushState({ view }, '', url);
  };

  const handleLogin = async (role, username) => {
    setBooting(true);
    try {
      resumeSession();
      const [profile, state] = await Promise.all([api('session'), role === 'Super Admin' ? emptyState() : api('state')]);
      userRef.current = { role, username };
      setCurrentUser(role);
      setCurrentUsername(username);
      setCurrentProfile(profile);
      setStartupError('');
      installState(state);
      setSyncMessage('');
      setSaveStatus('');
      restorePending(state, { role, username });
      handleNavigate('dashboard');
    } catch (error) {
      setStartupError(error.message);
    } finally {
      setBooting(false);
    }
  };

  const handleLogout = async () => {
    // Preserve pending work for this account, but never make form or network errors trap a user.
    persistPending(syncedRef.current, recordsRef.current);
    dismissSession();
    userRef.current = null;
    saveControllerRef.current?.abort();
    saveControllerRef.current = null;
    savingRef.current = false;
    clearTimeout(retryRef.current);
    setCurrentUser(null);
    setCurrentUsername(null);
    setStartupError('');
    setSyncMessage('');
    setSaveStatus('');
    setDraftStorageFailed(false);
    installState(emptyState());
    setCurrentView('dashboard');
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'login');
    window.history.replaceState({}, '', url);
    try {
      await endSession(() => api('logout', { method: 'POST', signal: AbortSignal.timeout(5000) }));
    } catch (error) {
      if (error.status !== 401 && isSessionDismissed()) setSyncMessage('Signed out on this device. Server sign-out could not be confirmed while the connection is unavailable.');
    }
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
    <button type="button" onClick={handleLogout}>Sign Out</button>
  </div>;

  return <CurrentUserContext.Provider value={currentUser ? currentProfile : null}><DraftScope.Provider key={currentUsername || 'signup'} value={currentUser + ':' + (currentUsername || 'signup')}><ErrorBoundary onLogout={currentUser ? handleLogout : undefined}>
    {isDemo && <aside className="medvault-demo-banner" aria-label="Frontend demo information">
      <div><strong>Frontend demo</strong><span>Fictional data only. Changes reset when you refresh.</span>
        {!currentUser && <p>Logins: <code>demo.receptionist</code>, <code>demo.secretary</code>, <code>demo.admin</code> &middot; Password: <code>DemoPass123!</code></p>}
      </div>
      <button type="button" onClick={() => window.location.reload()}>Reset demo</button>
    </aside>}
    {draftStorageFailed && <div className="medvault-sync-alert" role="alert">Browser storage is unavailable or full. Keep this page open until your changes are saved to the server.</div>}
    {isMedicalSecretary && legacyAvailable && <div className="medvault-import-alert" role="status">
      <span>Records from the previous browser-only version are available here. Importing replaces shared records before clinical changes have been made.</span>
      <button type="button" disabled={importingLegacy} onClick={importBrowserRecords}>
        {importingLegacy ? 'Importing…' : 'Import Browser Records'}
      </button>
      <button type="button" onClick={() => setLegacyAvailable(false)} aria-label="Dismiss import option">×</button>
    </div>}
    {syncMessage && <div className="medvault-sync-alert" role="alert">{syncMessage}
      {currentUser && <button type="button" onClick={() => flushRef.current?.()}>Retry Save</button>}
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
  </ErrorBoundary></DraftScope.Provider></CurrentUserContext.Provider>;
}
