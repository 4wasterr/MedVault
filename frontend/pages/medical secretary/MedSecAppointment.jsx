import React, { useEffect, useMemo, useState } from 'react';
import MedSecShell from './MedSecShell';
import { useDraftState } from '../../client/src/useDraftState';
import { demographicsProblem, normalizeVisitType, VISIT_TYPES, SPECIALTIES, ROOMS, normalizeRoom, specialtyLabel, formatPhone } from '../../shared/formRules.mjs';
import { patientVisits, availableSlots, createRecordId, dateKey, displayDate, displayTime, getSchedule, timeKey, todayISO, visitStatus } from './medsecData';
import { validateBooking } from './medsecData';
import { appointmentStage, canUndoCheckIn, isTerminalAppointment } from '../../shared/appointmentWorkflow.mjs';
import { appointmentConflict, isDoctorActive, doctorDisplayName, CLINIC_OPEN, LAST_APPOINTMENT } from '../../shared/schedulingRules.mjs';
import { isPatientArchived } from '../../shared/patientArchive.mjs';
import { filterAppointmentQueue, appointmentBadgeClass } from '../../shared/appointmentQueue.mjs';

const emptyForm = (doctor = '', specialty = '') => ({ patientId: '', doctor, specialty, room: 'Room 1', date: todayISO(), time: '', type: 'New Consultation', notes: '' });
const progress = ['Confirmed', 'Checked-In', 'In Consultation', 'Completed'];

export default function MedSecAppointment({
  onNavigate, onLogout, patients = [], setPatients, appointments = [], setAppointments, schedules = {}, doctors: managedDoctors = [], onRecordView,
}) {
  const activeDoctors = managedDoctors.filter(isDoctorActive).map((doctor) => doctor.name);
  const doctorSpecialty = (name) => managedDoctors.find((doctor) => doctor.name === name)?.specialty || '';
  const [selectedId, setSelectedId] = useDraftState('secretary-booking:selectedId', null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  const [formMode, setFormMode] = useDraftState('secretary-booking:formMode', null);
  const [form, setForm] = useDraftState('secretary-booking:form', () => emptyForm(activeDoctors[0], doctorSpecialty(activeDoctors[0])));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const filtered = useMemo(() => filterAppointmentQueue(appointments, {
    view: 'all', search, date: dateFilter, doctors: managedDoctors,
  }).filter(item => statusFilter === 'All' || appointmentStage(item) === statusFilter), [appointments, managedDoctors, search, dateFilter, statusFilter]);
  const selected = appointments.find((item) => item.id === selectedId);
  const selectedStage = appointmentStage(selected);
  const progressStage = selectedStage === 'Waiting' ? 'Checked-In' : selectedStage;
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled && selected) void onRecordView?.('appointments', selectedId, 'apptInfo'); });
    return () => { cancelled = true; };
  }, [selectedId, Boolean(selected), onRecordView]);
  const linkedPatient = patients.find((item) => item.id === selected?.patientId);
  const formSlots = availableSlots(schedules, appointments, form.doctor, form.date, formMode?.id, form.room);
  const currentSchedule = getSchedule(schedules, form.doctor, form.date);
  const formSpecialty = form.specialty || doctorSpecialty(form.doctor);
  const eligibleDoctors = activeDoctors.filter((doctor) => doctorSpecialty(doctor) === formSpecialty);
  const formPatient = patients.find((patient) => patient.id === form.patientId);
  const liveProblem = formPatient ? demographicsProblem({ ...formPatient, birthday: dateKey(formPatient.birthday) }) ||
    (form.time && form.date ? validateBooking({ ...form, patientName: formPatient.name, contact: formPatient.contact }, { checkDate: true }) ||
      appointmentConflict({ ...form, id: formMode?.id }, appointments, schedules, { doctors: managedDoctors }) : '') : '';

  const startForm = (mode, appointment) => {
    setFormMode({ kind: mode, id: appointment?.id || null, snapshot: appointment || null });
    setForm(appointment ? {
      patientId: appointment.patientId || '', doctor: appointment.doctor || activeDoctors[0] || '',
      specialty: appointment.specialty || doctorSpecialty(appointment.doctor),
      date: dateKey(appointment.date) || todayISO(), time: timeKey(appointment.time),
      type: normalizeVisitType(appointment.type), room: normalizeRoom(appointment.room), notes: appointment.notes || '',
    } : emptyForm(activeDoctors[0], doctorSpecialty(activeDoctors[0])));
    setError(''); setMessage('');
  };

  const saveBooking = (event) => {
    event.preventDefault();
    const existing = appointments.find((item) => item.id === formMode?.id);
    if (formMode?.id && JSON.stringify(existing || null) !== JSON.stringify(formMode.snapshot)) {
      setError('This booking changed in another session. Reopen it to review the latest details.'); return;
    }
    const patient = patients.find((item) => item.id === form.patientId);
    if (!patient) { setError('Choose a patient profile.'); return; }
    if (isPatientArchived(patient)) { setError('Restore this archived patient before booking.'); return; }
    if (!SPECIALTIES.includes(formSpecialty)) { setError('Choose a visit specialty.'); return; }
    if (doctorSpecialty(form.doctor) !== formSpecialty) { setError('Choose a doctor in the selected visit specialty.'); return; }
    const patientProblem = demographicsProblem({ ...patient, birthday: dateKey(patient.birthday) });
    if (patientProblem) { setError(`${patientProblem} Update the linked patient profile before booking.`); return; }
    const bookingProblem = validateBooking({ ...form, patientName: patient.name, contact: patient.contact }, { checkDate: true });
    if (bookingProblem) { setError(bookingProblem); return; }
    const conflict = appointmentConflict({ ...form, id: formMode?.id }, appointments, schedules, { doctors: managedDoctors });
    if (conflict) { setError(conflict); return; }
    const id = existing?.id || createRecordId('APPT');
    const booking = {
      ...existing, id, patientId: patient.id, patientName: patient.name, age: patient.age, sex: patient.sex,
      contact: formatPhone(patient.contact), email: patient.email || '', address: patient.address, emergencyName: patient.emergencyName,
      emergencyContact: formatPhone(patient.emergencyContact), emergencyRelationship: patient.emergencyRelationship, doctor: form.doctor, room: normalizeRoom(form.room || existing?.room), date: form.date,
      time: displayTime(form.time), type: form.type, specialty: formSpecialty, notes: form.notes,
      status: existing && existing.status !== 'Open' ? existing.status : 'Confirmed',
      visitStatus: existing && existing.status !== 'Open' ? visitStatus(existing) : 'Waiting',
    };
    setAppointments((current) => existing ? current.map((item) => item.id === id ? booking : item) : [booking, ...current]);
    setPatients((current) => current.map((item) => {
      const history = (item.appointments || []).filter((entry) => entry.sourceAppointmentId !== id);
      if (item.id !== patient.id) return item.id === existing?.patientId ? { ...item, appointments: history } : item;
      return { ...item, appointments: [{ sourceAppointmentId: id, date: displayDate(form.date), doctor: form.doctor,
        type: form.type, status: booking.status }, ...history] };
    }));
    setSearch(''); setDateFilter(''); setStatusFilter('All');
    setSelectedId(id); setFormMode(null); setForm(emptyForm(activeDoctors[0], doctorSpecialty(activeDoctors[0]))); setError(''); setMessage('Booking saved and shared with reception.');
  };

  const advance = () => {
    if (!selected || selected.status === 'Open' || selected.status === 'Cancelled') return;
    if (!linkedPatient) { setMessage('Link this booking to a patient profile before updating visit progress.'); return; }
    const stage = appointmentStage(selected);
    const currentIndex = progress.indexOf(stage === 'Waiting' ? 'Checked-In' : stage);
    if (currentIndex < 0) return;
    if (currentIndex >= progress.length - 1) return;
    const next = progress[currentIndex + 1];
    if (next === 'In Consultation') {
      const conflict = appointmentConflict({ ...selected, status: next, visitStatus: next }, appointments, schedules, { doctors: managedDoctors });
      if (conflict) { setError(conflict); setMessage(''); return; }
    }
    setAppointments((items) => items.map((item) => item.id === selected.id ? { ...item, status: next,
      visitStatus: ['Confirmed', 'Checked-In', 'Waiting'].includes(next) ? 'Waiting' : next } : item));
    if (selected.patientId && !['Checked-In', 'Waiting'].includes(next)) {
      setPatients((items) => items.map((patient) => {
        if (patient.id !== selected.patientId) return patient;
        const updated = { ...patient, status: next,
          appointments: (patient.appointments || []).map((entry) => entry.sourceAppointmentId === selected.id
            ? { ...entry, status: next === 'Completed' ? 'Done' : next } : entry),
        };
        if (next === 'Completed') {
          const previousVisits = patientVisits(patient);
          const savedVisit = { id: `visit-${selected.id}`, appointmentId: selected.id, date: displayDate(selected.date),
            doctor: selected.doctor, type: normalizeVisitType(selected.type),
            summary: patient.consultation?.findings || patient.medical?.diagnosis || '',
            notes: selected.notes || '', diagnosis: patient.consultation?.diagnosis || patient.medical?.diagnosis || '',
            treatment: patient.consultation?.treatment || patient.medical?.treatment || '',
            followUp: patient.consultation?.followUp || patient.medical?.notes || '',
            vitalsSummary: [['bp', 'BP', 'mmHg'], ['hr', 'HR', 'bpm'], ['temp', 'Temp', '°C'],
              ['respRate', 'RR', '/min'], ['spo2', 'SpO2', '%'], ['weight', 'Weight', 'kg'], ['height', 'Height', 'cm']]
              .filter(([key]) => patient.vitals?.[key])
              .map(([key, label, unit]) => `${label} ${patient.vitals[key]} ${unit}`)
              .concat(patient.vitals?.measuredAt ? [`Measured ${patient.vitals.measuredAt}`] : [])
              .concat(patient.vitals?.measuredBy ? [`By ${patient.vitals.measuredBy}`] : [])
              .join(' · '),
            vitals: { ...patient.vitals }, savedAt: new Date().toISOString(),
          };
          updated.visits = patientVisits({ visits: [savedVisit, ...previousVisits] });
        }
        return updated;
      }));
    }
    setError(''); setMessage(next === 'Completed' ? 'Visit completed and saved in Visit History.' : next === 'Checked-In'
      ? 'Patient checked in. Reception and the clinic queue share this arrival status.' : `Visit moved to ${next}.`);
  };

  const undoCheckIn = () => {
    if (!canUndoCheckIn(selected)) return;
    setAppointments(items => items.map(item => item.id === selected.id ? { ...item, status: 'Confirmed' } : item));
    setMessage('Check-in undone. The booking is confirmed and the patient is awaiting arrival.');
  };

  const linkPatient = (patientId) => {
    const patient = patients.find((item) => item.id === patientId);
    if (!patient || !selected) return;
    setAppointments((items) => items.map((item) => item.id === selected.id ? {
      ...item, patientId: patient.id, patientName: patient.name, age: patient.age, sex: patient.sex, email: patient.email || '', contact: formatPhone(patient.contact),
      address: patient.address, emergencyName: patient.emergencyName, emergencyRelationship: patient.emergencyRelationship, emergencyContact: formatPhone(patient.emergencyContact),
    } : item));
    setPatients((items) => items.map((item) => {
      const history = (item.appointments || []).filter((entry) => entry.sourceAppointmentId !== selected.id);
      if (item.id !== patient.id) return item.id === selected.patientId ? { ...item, appointments: history } : item;
      return { ...item, appointments: [{ sourceAppointmentId: selected.id, date: displayDate(selected.date),
        doctor: selected.doctor, type: selected.type, status: selected.status }, ...history] };
    }));
    setMessage('Booking linked to the shared patient profile.');
  };

  const cancelBooking = () => {
    if (!cancelTarget) return;
    const appointment = cancelTarget;
    if (JSON.stringify(appointments.find((item) => item.id === appointment.id) || null) !== JSON.stringify(appointment)) {
      setCancelTarget(null);
      setMessage('This appointment changed in another session. Review it before cancelling.');
      return;
    }
    const cancelled = { ...appointment, status: 'Cancelled', cancelledAt: new Date().toISOString(),
      cancellationNote: 'Cancelled by medical secretary.' };
    const freedSlot = { ...appointment, id: createRecordId('APPT'), patientId: null,
      patientName: '*Available Slot*', age: null, sex: null, contact: '', email: '', address: '',
      emergencyName: '', emergencyRelationship: '', emergencyContact: '', status: 'Open', visitStatus: 'Waiting', cancelledAt: undefined,
      notes: 'Slot freed upon cancellation.' };
    setAppointments((items) => [freedSlot, ...items.map((item) => item.id === appointment.id ? cancelled : item)]);
    if (appointment.patientId) setPatients((items) => items.map((patient) => patient.id === appointment.patientId ? {
      ...patient,
      status: patient.status === visitStatus(appointment) ? 'Waiting' : patient.status,
      appointments: (patient.appointments || []).map((entry) => entry.sourceAppointmentId === appointment.id
        ? { ...entry, status: 'Cancelled' } : entry),
    } : patient));
    setCancelTarget(null);
    setMessage('Appointment cancelled. The slot is available for booking again.');
  };

  return <MedSecShell active="appointments" title="Appointments" subtitle="Shared bookings and patient visit progress" onNavigate={onNavigate} onLogout={onLogout}>
    <div className="medsec-grid">
      <section className="medsec-panel" aria-label="Appointment list">
        <div className="medsec-panel-heading"><h2>Bookings <span className="medsec-badge">{filtered.length}</span></h2>
          <button type="button" className="medsec-btn" onClick={() => startForm('new')}>+ New Booking</button></div>
        <div className="medsec-form-grid medsec-filters">
          <label className="medsec-field wide"><span>Search bookings</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Patient, doctor, ID, or type" /></label>
          <label className="medsec-field"><span>Date</span><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></label>
          <label className="medsec-field"><span>Visit status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {['All', 'Confirmed', 'Checked-In', 'Waiting', 'In Consultation', 'Completed', 'Open', 'Cancelled', 'No-Show'].map((value) => <option key={value}>{value}</option>)}
          </select></label>
        </div>
        <div className="medsec-list">
          {filtered.map((item) => {
            const status = appointmentStage(item);
            return <button key={item.id} type="button" className={`medsec-list-item ${selectedId === item.id ? 'active' : ''}`}
              onClick={() => { setSelectedId(item.id); setFormMode(null); setError(''); setMessage(''); }}>
              <span><strong>{status === 'Open' ? 'Open slot' : item.patientName || 'Unlinked patient'}</strong><small>{displayDate(item.date)} · {displayTime(item.time)} · {doctorDisplayName(item.doctor, managedDoctors)}</small></span>
              <span className={`medsec-badge ${appointmentBadgeClass(item)}`}>{status}</span>
            </button>;
          })}
          {!filtered.length && <p className="medsec-muted">No bookings match these filters.</p>}
        </div>
      </section>

      <section className="medsec-panel" aria-label="Appointment details">
        {formMode ? <>
          <div className="medsec-panel-heading">
            <h2>{formMode.kind === 'new' ? 'New Booking' : formMode.kind === 'open' ? 'Book Open Slot' : 'Edit Booking'}</h2>
            <button type="button" className="medsec-btn outline" onClick={() => { setFormMode(null); setError(''); }}>Cancel</button>
          </div>
          <p className="medsec-muted">Choose any minute within the doctor operating hours. Each appointment lasts 30 minutes and cannot overlap bookings or blocked periods.</p>
          <form onSubmit={saveBooking}>
            <div className="medsec-form-grid">
              <label className="medsec-field wide"><span>Patient profile *</span><select required value={form.patientId} onChange={(event) => { setError(''); setForm({ ...form, patientId: event.target.value }); }}>
                <option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} ({patient.id})</option>)}
              </select></label>
              <label className="medsec-field"><span>Visit specialty *</span><select required value={formSpecialty} onChange={(event) => {
                const specialty = event.target.value;
                const doctor = managedDoctors.find((item) => isDoctorActive(item) && item.specialty === specialty)?.name || '';
                setError(''); setForm({ ...form, specialty, doctor, time: '' });
              }}><option value="">Select visit specialty</option>{SPECIALTIES.map((specialty) => <option key={specialty} value={specialty}>{specialtyLabel(specialty)}</option>)}</select></label>
              <label className="medsec-field"><span>Doctor *</span><select required value={form.doctor} onChange={(event) => { setError(''); setForm({ ...form, doctor: event.target.value, time: '' }); }}>
                <option value="">{eligibleDoctors.length ? 'Select doctor' : 'No doctors for this specialty'}</option>
                {[...new Set([...eligibleDoctors, ...(formMode.kind === 'edit' && form.doctor && doctorSpecialty(form.doctor) === formSpecialty ? [form.doctor] : [])])]
                  .map((doctor) => <option key={doctor}>{doctor}</option>)}
              </select></label>
              <label className="medsec-field"><span>Date *</span><input type="date" required min={todayISO()} value={form.date} onChange={(event) => { setError(''); setForm({ ...form, date: event.target.value, time: '' }); }} /></label>
              <label className="medsec-field"><span>Time *</span><input type="time" step="60" min={CLINIC_OPEN} max={LAST_APPOINTMENT} required value={form.time} onChange={event => { setError(''); setForm({ ...form, time: event.target.value }); }} /></label>
              <label className="medsec-field"><span>Visit type *</span><select required value={form.type} onChange={event => { setError(''); setForm({ ...form, type: event.target.value }); }}>{VISIT_TYPES.map(item => <option key={item}>{item}</option>)}</select></label>
              <label className="medsec-field"><span>Room assignment</span><select aria-label="Room assignment" value={normalizeRoom(form.room)} onChange={event => setForm({ ...form, room: event.target.value })}>{ROOMS.map(room => <option key={room}>{room}</option>)}</select></label>
              <label className="medsec-field wide"><span>Booking notes</span><textarea maxLength={2000} value={form.notes} onChange={(event) => { setError(''); setForm({ ...form, notes: event.target.value }); }} /></label>
            </div>
            <p className="medsec-muted">{formSlots.length} free slots · {displayTime(currentSchedule.start)}–{displayTime(currentSchedule.end)}
              {schedules[`${form.doctor}|${form.date}`] ? ' (saved availability)' : ' (default availability)'}</p>
            {!formSlots.length && <p className="medsec-notice">No free times. Change the date or adjust availability in Doctor Schedules.</p>}
            {(liveProblem || error) && <p className="medsec-error" role="alert">{liveProblem || error}</p>}
            <div className="medsec-actions"><button type="button" className="medsec-btn secondary" onClick={() => setFormMode(null)}>Cancel</button>
              <button type="submit" className="medsec-btn">Save Booking</button></div>
          </form>
        </> : selected ? <>
          <div className="medsec-panel-heading"><div><span className="medsec-muted">{selected.id}</span><h2>{selected.patientName}</h2></div>
            <div className="medsec-heading-actions">
              <button type="button" className="medsec-btn outline" onClick={() => { setSelectedId(null); setMessage(''); }}>Back to Bookings</button>
              {selected.status !== 'Open' && selected.status !== 'Cancelled' && visitStatus(selected) !== 'Completed' &&
                <button type="button" className="medsec-btn danger" onClick={() => setCancelTarget(selected)}>Cancel Appointment</button>}
            </div></div>
          <span className={`medsec-badge ${appointmentBadgeClass(selected)}`}>{appointmentStage(selected)}</span>
          <div className="medsec-info-row"><span>Date and time</span><span>{displayDate(selected.date)} · {displayTime(selected.time)}</span></div>
          <div className="medsec-info-row"><span>Doctor</span><span>{doctorDisplayName(selected.doctor, managedDoctors)}</span></div>
          <div className="medsec-info-row"><span>Visit specialty</span><span>{specialtyLabel(selected.specialty || doctorSpecialty(selected.doctor)) || 'Not specified'}</span></div>
          <div className="medsec-info-row"><span>Visit type</span><span>{selected.type}</span></div>
          <div className="medsec-info-row"><span>Room</span><span>{selected.room || 'To be assigned'}</span></div>
          <div className="medsec-info-row"><span>Booking notes</span><span>{selected.notes || 'None'}</span></div>
          {selected.status !== 'Open' && <>
            <div className="medsec-info-row"><span>Contact number</span><span>{formatPhone(linkedPatient?.contact || selected.contact) || 'Not specified'}</span></div>
            <div className="medsec-info-row"><span>Emergency contact</span><span>{linkedPatient?.emergencyName || selected.emergencyName || 'Not specified'}</span></div>
            <div className="medsec-info-row"><span>Emergency relationship</span><span>{linkedPatient?.emergencyRelationship || selected.emergencyRelationship || 'Not specified'}</span></div>
            <div className="medsec-info-row"><span>Emergency number</span><span>{formatPhone(linkedPatient?.emergencyContact || selected.emergencyContact) || 'Not specified'}</span></div>
          </>}
          {selected.status === 'Open' ? <div className="medsec-actions"><button type="button" className="medsec-btn" onClick={() => startForm('open', selected)}>Book This Slot</button></div> : <>
            <div className="medsec-section-divider" />
            {linkedPatient ? <div className="medsec-actions"><button type="button" className="medsec-btn secondary" onClick={() => onNavigate('patients', { patientId: linkedPatient.id,
              tab: visitStatus(selected) === 'Completed' ? 'visits' : 'consultation' })}>Open Linked Patient Visit</button></div>
              : !isTerminalAppointment(selected) && <label className="medsec-field"><span>Link a patient profile</span><select value="" onChange={(event) => linkPatient(event.target.value)}><option value="">Choose a patient</option>
                {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} ({patient.id})</option>)}</select></label>}
            {!isTerminalAppointment(selected) && <>
              <h3>Visit progress</h3>
              <div className="medsec-progress">{progress.map((step, index) => <React.Fragment key={step}>
                {index > 0 && <span aria-hidden="true">→</span>}
                <span className={`medsec-progress-step ${progress.indexOf(progressStage) > index ? 'done' : progressStage === step ? 'active' : ''}`}>{step === 'Checked-In' ? 'Checked-In / Waiting' : step}</span>
              </React.Fragment>)}</div>
              {visitStatus(selected) !== 'Completed' && <button type="button" className="medsec-btn" onClick={advance} disabled={!linkedPatient}
                title={!linkedPatient ? 'Link a patient profile first' : undefined}>
                {appointmentStage(selected) === 'Confirmed' ? 'Check-In' : ['Checked-In', 'Waiting'].includes(appointmentStage(selected)) ? 'Start Consultation' : 'Mark Completed'}
              </button>}
              {canUndoCheckIn(selected) && <button type="button" className="medsec-btn secondary" onClick={undoCheckIn}>Undo Check-In</button>}
              {appointmentStage(selected) === 'Confirmed' && <p className="medsec-notice">Awaiting arrival. Reception normally checks in the patient; the medical secretary can check in on arrival when needed.</p>}
              {!linkedPatient && <p className="medsec-notice">Link a patient profile before advancing this visit.</p>}
            </>}
            {['Confirmed', 'Checked-In', 'Waiting'].includes(appointmentStage(selected)) && <div className="medsec-actions">
              <button type="button" className="medsec-btn secondary" onClick={() => startForm('edit', selected)}>Edit / Reschedule</button>
            </div>}
          </>}
        </> : <div><h2>Select a booking</h2><p className="medsec-muted">Choose an appointment to view its linked patient and update the visit.</p></div>}
        {message && <p className="medsec-notice" role="status">{message}</p>}
        {!formMode && error && <p className="medsec-error" role="alert">{error}</p>}
      </section>
    </div>
    {cancelTarget && <div className="medsec-modal-backdrop" role="presentation" onClick={() => setCancelTarget(null)}>
      <div className="medsec-modal" role="dialog" aria-modal="true" aria-labelledby="medsec-cancel-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="medsec-cancel-title">Cancel appointment?</h2>
        <p>Cancel the appointment for <strong>{cancelTarget.patientName}</strong> on <strong>{displayDate(cancelTarget.date)}</strong> at <strong>{displayTime(cancelTarget.time)}</strong>? The slot will become available again.</p>
        <div className="medsec-actions">
          <button type="button" className="medsec-btn secondary" onClick={() => setCancelTarget(null)}>Keep Appointment</button>
          <button type="button" className="medsec-btn danger" onClick={cancelBooking}>Cancel Appointment</button>
        </div>
      </div>
    </div>}
  </MedSecShell>;
}
