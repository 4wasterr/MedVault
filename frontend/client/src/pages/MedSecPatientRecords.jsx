import React, { useEffect, useMemo, useState } from 'react';
import MedSecShell from './MedSecShell';

const tabs = [
  ['personal', 'Personal'], ['vitals', 'Vitals'], ['medicalHistory', 'Medical History'],
  ['consultation', 'Consultation'], ['visits', 'Visit History'], ['notes', 'Notes'],
];

function preparePatient(patient) {
  if (!patient) return null;
  const previousVisits = (patient.appointments || [])
    .filter((appointment) => /done|completed/i.test(appointment.status || ''))
    .map((appointment, index) => ({ id: `legacy-${patient.id}-${index}`, date: appointment.date || '',
      doctor: appointment.doctor || '', type: appointment.type || '', summary: '', diagnosis: '',
      treatment: '', followUp: '', vitalsSummary: '', notes: '' }));
  return {
    ...patient,
    vitals: { bp: '', hr: '', temp: '', respRate: '', spo2: '', weight: '', height: '', measuredAt: '', measuredBy: '', suppliedBy: '', ...patient.vitals },
    medicalHistory: {
      conditions: patient.medicalHistory?.conditions ?? patient.medical?.history ?? '',
      allergies: patient.medicalHistory?.allergies ?? patient.medical?.allergies ?? '',
      medications: patient.medicalHistory?.medications ?? patient.medical?.medications ?? '',
      reportedBy: patient.medicalHistory?.reportedBy ?? '', reportedAt: patient.medicalHistory?.reportedAt ?? '',
    },
    consultation: {
      findings: patient.consultation?.findings ?? '',
      diagnosis: patient.consultation?.diagnosis ?? patient.medical?.diagnosis ?? '',
      treatment: patient.consultation?.treatment ?? patient.medical?.treatment ?? '',
      followUp: patient.consultation?.followUp ?? patient.medical?.notes ?? '',
      doctor: patient.consultation?.doctor ?? patient.doctor ?? '', consultedAt: patient.consultation?.consultedAt ?? '',
    },
    visits: patient.visits ?? previousVisits,
    recordNotes: patient.recordNotes ?? [],
  };
}

function Field({ label, value, onChange, type = 'text', wide = false, multiline = false, placeholder = '', readOnly = false }) {
  return <label className={`medsec-field ${wide ? 'wide' : ''}`}><span>{label}</span>
    {multiline ? <textarea value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      : <input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} readOnly={readOnly} />}
  </label>;
}

export default function MedSecPatientRecords({
  patients = [], setPatients, appointments = [], setAppointments, selectedPatientId, initialTab = 'personal', onNavigate, onLogout,
}) {
  const [selectedId, setSelectedId] = useState(selectedPatientId || null);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(() => preparePatient(patients.find((item) => item.id === selectedPatientId)));
  const [basePatient, setBasePatient] = useState(() => patients.find((item) => item.id === selectedPatientId) || null);
  const [noteText, setNoteText] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const patient = patients.find((item) => item.id === selectedId);
  useEffect(() => {
    if (dirty) return undefined;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setDraft(preparePatient(patient));
        setBasePatient(patient || null);
      }
    });
    return () => { cancelled = true; };
  }, [patient, dirty]);
  const filtered = useMemo(() => patients.filter((item) =>
    `${item.id} ${item.name} ${item.contact || ''}`.toLowerCase().includes(search.toLowerCase())
  ), [patients, search]);
  const linkedCount = appointments.filter((item) => item.patientId === selectedId && item.status !== 'Open').length;

  const update = (key, value) => { setDirty(true); setDraft((current) => ({ ...current, [key]: value })); };
  const updateGroup = (group, key, value) => { setDirty(true); setDraft((current) => ({ ...current, [group]: { ...current[group], [key]: value } })); };
  const updateVisit = (index, key, value) => { setDirty(true); setDraft((current) => ({ ...current,
    visits: current.visits.map((visit, visitIndex) => visitIndex === index ? { ...visit, [key]: value } : visit),
  })); };
  const navigate = (...args) => {
    if (dirty && !window.confirm('Discard unsaved patient record changes?')) return;
    onNavigate(...args);
  };
  const selectPatient = (item) => {
    if (dirty && !window.confirm('Discard unsaved patient record changes?')) return;
    setSelectedId(item.id); setDraft(preparePatient(item)); setBasePatient(item); setActiveTab('personal');
    setNoteText(''); setMessage(''); setError(''); setDirty(false);
  };

  const save = () => {
    if (JSON.stringify(patient || null) !== JSON.stringify(basePatient)) {
      setError('This patient was updated in another session. Review the latest record before saving.'); return;
    }
    if (!draft?.name?.trim()) { setError('Patient name is required.'); return; }
    if (draft.visits.some((visit) => !visit.date?.trim() || !visit.doctor?.trim())) {
      setError('Each visit record needs a date and doctor.'); setActiveTab('visits'); return;
    }
    const pendingNote = noteText.trim();
    const updated = { ...draft, name: draft.name.trim(),
      recordNotes: pendingNote ? [
        { id: `note-${Date.now()}`, text: pendingNote, author: 'Medical Secretary', createdAt: new Date().toISOString() },
        ...draft.recordNotes,
      ] : draft.recordNotes,
      medical: { ...draft.medical, history: draft.medicalHistory.conditions, allergies: draft.medicalHistory.allergies,
        medications: draft.medicalHistory.medications, diagnosis: draft.consultation.diagnosis,
        treatment: draft.consultation.treatment, notes: draft.consultation.followUp },
      lastUpdatedAt: new Date().toISOString(), lastUpdatedBy: 'Medical Secretary',
    };
    setPatients((current) => current.map((item) => item.id === updated.id ? updated : item));
    setAppointments?.((current) => current.map((item) => item.patientId === updated.id ? {
      ...item, patientName: updated.name, age: updated.age, sex: updated.sex, contact: updated.contact,
      address: updated.address, emergencyName: updated.emergencyName, emergencyContact: updated.emergencyContact,
    } : item));
    setDraft(updated); setBasePatient(updated); setNoteText(''); setDirty(false); setError(''); setMessage('Patient record saved. Changes are shared with reception.');
  };

  const addNote = () => {
    if (!noteText.trim()) return;
    setDraft((current) => ({ ...current, recordNotes: [
      { id: `note-${Date.now()}`, text: noteText.trim(), author: 'Medical Secretary', createdAt: new Date().toISOString() },
      ...current.recordNotes,
    ] }));
    setDirty(true); setNoteText(''); setMessage('Note added to the draft. Save Changes to keep it.');
  };

  return <MedSecShell active="patients" title="Patient Records" subtitle="Shared patient profiles, clinical details, and saved visits" onNavigate={navigate}
    onLogout={() => { if (!dirty || window.confirm('Discard unsaved patient record changes?')) onLogout(); }}>
    <div className="medsec-grid">
      <section className="medsec-panel" aria-label="Patient list">
        <h2>Patients <span className="medsec-badge">{patients.length}</span></h2>
        <label className="medsec-field" style={{ marginBottom: 16 }}><span>Find patient</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, ID, or contact" />
        </label>
        <div className="medsec-list">
          {filtered.map((item) => <button key={item.id} type="button" className={`medsec-list-item ${selectedId === item.id ? 'active' : ''}`}
            onClick={() => selectPatient(item)}>
            <span><strong>{item.name}</strong><small>{item.id} · {item.contact || 'No contact'}</small></span>
            <span className={`medsec-badge ${['Done', 'Completed'].includes(item.status) ? 'completed' : ''}`}>{item.status || 'Active'}</span>
          </button>)}
          {!filtered.length && <p className="medsec-muted">No matching patients.</p>}
        </div>
      </section>

      <section className="medsec-panel" aria-label="Patient profile">
        {!draft ? <div><h2>Select a patient</h2><p className="medsec-muted">Choose a shared profile to review or edit its records.</p></div> : <>
          <div className="medsec-profile-heading"><div><span className="medsec-muted">{draft.id}</span><h2>{draft.name}</h2>
            <span className="medsec-muted">{draft.age || '—'} years · {draft.sex || 'Not specified'} · {linkedCount} linked booking(s)</span></div>
            <button type="button" className="medsec-btn secondary" onClick={() => navigate('appointments')}>View Appointments</button>
          </div>
          <div className="medsec-tabs" role="tablist" aria-label="Patient record sections">
            {tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={activeTab === key}
              className={`medsec-tab ${activeTab === key ? 'active' : ''}`} onClick={() => { setActiveTab(key); setMessage(''); }}>{label}</button>)}
          </div>

          {activeTab === 'personal' && <div className="medsec-form-grid">
            <Field label="Full name" value={draft.name} onChange={(value) => update('name', value)} />
            <Field label="Birthday" value={draft.birthday} onChange={(value) => update('birthday', value)} placeholder="e.g. Jan 10, 1991" />
            <Field label="Age (years)" type="number" value={draft.age} onChange={(value) => update('age', value)} />
            <label className="medsec-field"><span>Sex</span><select value={draft.sex || ''} onChange={(event) => update('sex', event.target.value)}><option value="">Select</option><option>Female</option><option>Male</option><option>Other</option></select></label>
            <Field label="Contact number" value={draft.contact} onChange={(value) => update('contact', value)} />
            <Field label="Emergency contact" value={draft.emergencyContact} onChange={(value) => update('emergencyContact', value)} />
            <Field label="Address" value={draft.address} onChange={(value) => update('address', value)} wide multiline />
            <Field label="Emergency contact name" value={draft.emergencyName} onChange={(value) => update('emergencyName', value)} wide />
          </div>}

          {activeTab === 'vitals' && <><p className="medsec-muted">Record measured values, units, time, and the person who measured or supplied them.</p>
            <div className="medsec-form-grid">
              {[['bp', 'Blood pressure (mmHg)'], ['hr', 'Heart rate (bpm)'], ['temp', 'Temperature (°C)'], ['respRate', 'Respiratory rate (breaths/min)'], ['spo2', 'Oxygen saturation (%)'], ['weight', 'Weight (kg)'], ['height', 'Height (cm)']].map(([key, label]) =>
                <Field key={key} label={label} value={draft.vitals[key]} onChange={(value) => updateGroup('vitals', key, value)} />)}
              <Field label="Measured at" type="datetime-local" value={draft.vitals.measuredAt} onChange={(value) => updateGroup('vitals', 'measuredAt', value)} />
              <Field label="Measured by" value={draft.vitals.measuredBy} onChange={(value) => updateGroup('vitals', 'measuredBy', value)} />
              <Field label="Supplied by (if reported)" value={draft.vitals.suppliedBy} onChange={(value) => updateGroup('vitals', 'suppliedBy', value)} />
            </div>
          </>}

          {activeTab === 'medicalHistory' && <><p className="medsec-muted">Patient-reported information. Record who supplied the details.</p>
            <div className="medsec-form-grid">
              <Field label="Reported conditions" value={draft.medicalHistory.conditions} onChange={(value) => updateGroup('medicalHistory', 'conditions', value)} wide multiline />
              <Field label="Allergies" value={draft.medicalHistory.allergies} onChange={(value) => updateGroup('medicalHistory', 'allergies', value)} wide multiline />
              <Field label="Current medications" value={draft.medicalHistory.medications} onChange={(value) => updateGroup('medicalHistory', 'medications', value)} wide multiline />
              <Field label="Reported by" value={draft.medicalHistory.reportedBy} onChange={(value) => updateGroup('medicalHistory', 'reportedBy', value)} />
              <Field label="Reported at" type="datetime-local" value={draft.medicalHistory.reportedAt} onChange={(value) => updateGroup('medicalHistory', 'reportedAt', value)} />
            </div>
          </>}

          {activeTab === 'consultation' && <><p className="medsec-muted">Transcribe details provided by the doctor and keep the provider identified.</p>
            <div className="medsec-form-grid">
              <Field label="Doctor / provider" value={draft.consultation.doctor} onChange={(value) => updateGroup('consultation', 'doctor', value)} />
              <Field label="Consulted at" type="datetime-local" value={draft.consultation.consultedAt} onChange={(value) => updateGroup('consultation', 'consultedAt', value)} />
              <Field label="Examination findings" value={draft.consultation.findings} onChange={(value) => updateGroup('consultation', 'findings', value)} wide multiline />
              <Field label="Diagnosis" value={draft.consultation.diagnosis} onChange={(value) => updateGroup('consultation', 'diagnosis', value)} wide multiline />
              <Field label="Treatment instructions" value={draft.consultation.treatment} onChange={(value) => updateGroup('consultation', 'treatment', value)} wide multiline />
              <Field label="Follow-up details" value={draft.consultation.followUp} onChange={(value) => updateGroup('consultation', 'followUp', value)} wide multiline />
            </div>
          </>}

          {activeTab === 'visits' && <><p className="medsec-muted">Previous visits and saved records. Newly completed appointments appear here.</p>
            {draft.visits.map((visit, index) => <div className="medsec-visit-card" key={visit.id || index}><div className="medsec-form-grid">
              <Field label="Visit date" value={visit.date} onChange={(value) => updateVisit(index, 'date', value)} />
              <Field label="Doctor" value={visit.doctor} onChange={(value) => updateVisit(index, 'doctor', value)} />
              <Field label="Visit type" value={visit.type} onChange={(value) => updateVisit(index, 'type', value)} />
              <Field label="Record ID" value={visit.id} onChange={() => {}} readOnly />
              <Field label="Saved summary" value={visit.summary} onChange={(value) => updateVisit(index, 'summary', value)} wide multiline />
              <Field label="Diagnosis" value={visit.diagnosis} onChange={(value) => updateVisit(index, 'diagnosis', value)} wide multiline />
              <Field label="Treatment instructions" value={visit.treatment} onChange={(value) => updateVisit(index, 'treatment', value)} wide multiline />
              <Field label="Follow-up details" value={visit.followUp} onChange={(value) => updateVisit(index, 'followUp', value)} wide multiline />
              <Field label="Saved vitals" value={visit.vitalsSummary} onChange={(value) => updateVisit(index, 'vitalsSummary', value)} wide multiline />
              <Field label="Visit notes" value={visit.notes} onChange={(value) => updateVisit(index, 'notes', value)} wide multiline />
            </div></div>)}
            {!draft.visits.length && <p className="medsec-muted">No completed visits recorded.</p>}
            <button type="button" className="medsec-btn secondary" onClick={() => { setDirty(true); setDraft((current) => ({ ...current,
              visits: [{ id: `visit-${Date.now()}`, date: '', doctor: '', type: '', summary: '', diagnosis: '',
                treatment: '', followUp: '', vitalsSummary: '', notes: '' }, ...current.visits],
            })); }}>+ Add Visit Record</button>
          </>}

          {activeTab === 'notes' && <><label className="medsec-field"><span>New note</span>
            <textarea value={noteText} onChange={(event) => { setNoteText(event.target.value); setDirty(true); }} placeholder="Add context for the care team" /></label>
            <div className="medsec-actions"><button type="button" className="medsec-btn secondary" onClick={addNote} disabled={!noteText.trim()}>Add Note</button></div>
            <div className="medsec-section-divider" />
            {draft.recordNotes.map((note, index) => <div className="medsec-note-card" key={note.id || index}>
              <div className="medsec-note-meta"><span>{note.author || 'Medical Secretary'}</span><span>{note.createdAt ? new Date(note.createdAt).toLocaleString() : 'Unsaved'}</span></div>
              <label className="medsec-field"><span>Note</span><textarea value={note.text || ''} onChange={(event) => { setDirty(true); setDraft((current) => ({ ...current,
                recordNotes: current.recordNotes.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item),
              })); }} /></label>
            </div>)}
            {!draft.recordNotes.length && <p className="medsec-muted">No notes yet.</p>}
          </>}

          {error && <p className="medsec-error" role="alert">{error}</p>}
          {message && <p className="medsec-notice" role="status">{message}</p>}
          <div className="medsec-actions">
            <button type="button" className="medsec-btn secondary" onClick={() => { setDraft(preparePatient(patient)); setBasePatient(patient); setNoteText(''); setDirty(false); setMessage('Changes reset.'); setError(''); }}>Reset Changes</button>
            <button type="button" className="medsec-btn" onClick={save}>Save Changes</button>
          </div>
          {dirty && <p className="medsec-muted" role="status">You have unsaved changes.</p>}
          {draft.lastUpdatedAt && <p className="medsec-muted">Last saved by {draft.lastUpdatedBy || 'staff'} on {new Date(draft.lastUpdatedAt).toLocaleString()}.</p>}
        </>}
      </section>
    </div>
  </MedSecShell>;
}
