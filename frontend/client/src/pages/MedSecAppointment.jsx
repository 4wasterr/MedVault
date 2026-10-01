import React, { useMemo, useState } from 'react';
import MedSecShell from './MedSecShell';
import { availableSlots, createRecordId, dateKey, displayDate, displayTime, DOCTORS, getSchedule, timeKey, todayISO, visitStatus } from './medsecData';

const emptyForm = () => ({ patientId: '', doctor: DOCTORS[0], date: todayISO(), time: '', type: 'Consultation', notes: '' });
const progress = ['Waiting', 'In Consultation', 'Completed'];

export default function MedSecAppointment({
  onNavigate, onLogout, patients = [], setPatients, appointments = [], setAppointments, schedules = {},
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  const [formMode, setFormMode] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);

  const selected = appointments.find((item) => item.id === selectedId);
  const linkedPatient = patients.find((item) => item.id === selected?.patientId);
  const doctors = [...new Set([...DOCTORS, ...appointments.map((item) => item.doctor).filter(Boolean)])];
  const filtered = useMemo(() => appointments.filter((item) => {
    const query = search.toLowerCase().trim();
    const matchesSearch = !query || `${item.patientName} ${item.doctor} ${item.id} ${item.type}`.toLowerCase().includes(query);
    const matchesDate = !dateFilter || dateKey(item.date) === dateFilter;
    const status = item.status === 'Open' || item.status === 'Cancelled' ? item.status : visitStatus(item);
    return matchesSearch && matchesDate && (statusFilter === 'All' || status === statusFilter);
  }).sort((a, b) => `${dateKey(b.date)} ${timeKey(b.time)}`.localeCompare(`${dateKey(a.date)} ${timeKey(a.time)}`)), [appointments, search, dateFilter, statusFilter]);

  const formSlots = availableSlots(schedules, appointments, form.doctor, form.date, formMode?.id);
  const currentSchedule = getSchedule(schedules, form.doctor, form.date);

  const startForm = (mode, appointment) => {
    setFormMode({ kind: mode, id: appointment?.id || null, snapshot: appointment || null });
    setForm(appointment ? {
      patientId: appointment.patientId || '', doctor: appointment.doctor || DOCTORS[0],
      date: dateKey(appointment.date) || todayISO(), time: timeKey(appointment.time),
      type: appointment.type || 'Consultation', notes: appointment.notes || '',
    } : emptyForm());
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
    if (!form.time || !availableSlots(schedules, appointments, form.doctor, form.date, formMode?.id).includes(form.time)) {
      setError('Choose an available 30-minute slot for this doctor and date.'); return;
    }
    const id = existing?.id || createRecordId('APPT');
    const booking = {
      ...existing, id, patientId: patient.id, patientName: patient.name, age: patient.age, sex: patient.sex,
      contact: patient.contact, address: patient.address, emergencyName: patient.emergencyName,
      emergencyContact: patient.emergencyContact, doctor: form.doctor, room: existing?.room || 'To be assigned', date: form.date,
      time: displayTime(form.time), type: form.type, notes: form.notes,
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
    setSelectedId(id); setFormMode(null); setError(''); setMessage('Booking saved and shared with reception.');
  };

  const advance = () => {
    if (!selected || selected.status === 'Open' || selected.status === 'Cancelled') return;
    if (!linkedPatient) { setMessage('Link this booking to a patient profile before updating visit progress.'); return; }
    const currentIndex = progress.indexOf(visitStatus(selected));
    if (currentIndex >= progress.length - 1) return;
    const next = progress[currentIndex + 1];
    setAppointments((items) => items.map((item) => item.id === selected.id ? { ...item, status: next, visitStatus: next } : item));
    if (selected.patientId) {
      setPatients((items) => items.map((patient) => {
        if (patient.id !== selected.patientId) return patient;
        const updated = { ...patient, status: next,
          appointments: (patient.appointments || []).map((entry) => entry.sourceAppointmentId === selected.id
            ? { ...entry, status: next === 'Completed' ? 'Done' : next } : entry),
        };
        if (next === 'Completed') {
          const previousVisits = patient.visits || (patient.appointments || [])
            .filter((appointment) => /done|completed/i.test(appointment.status || ''))
            .map((appointment, index) => ({ id: `legacy-${patient.id}-${index}`, date: appointment.date || '',
              doctor: appointment.doctor || '', type: appointment.type || '', summary: '', notes: '' }));
          const savedVisit = { id: `visit-${selected.id}`, appointmentId: selected.id, date: displayDate(selected.date),
            doctor: selected.doctor, type: selected.type,
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
          updated.visits = [savedVisit, ...previousVisits.filter((visit) => visit.appointmentId !== selected.id)];
        }
        return updated;
      }));
    }
    setMessage(next === 'Completed' ? 'Visit completed and saved in Visit History.' : `Visit moved to ${next}.`);
  };

  const linkPatient = (patientId) => {
    const patient = patients.find((item) => item.id === patientId);
    if (!patient || !selected) return;
    setAppointments((items) => items.map((item) => item.id === selected.id ? {
      ...item, patientId: patient.id, patientName: patient.name, contact: patient.contact,
      address: patient.address, emergencyName: patient.emergencyName, emergencyContact: patient.emergencyContact,
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
    setAppointments((items) => items.map((item) => item.id === appointment.id ? {
      ...item, patientId: null, patientName: '*Available Slot*', age: null, sex: null,
      contact: '', address: '', emergencyName: '', emergencyContact: '',
      status: 'Open', visitStatus: 'Waiting', notes: 'Slot freed upon cancellation.',
    } : item));
    if (appointment.patientId) setPatients((items) => items.map((patient) => patient.id === appointment.patientId ? {
      ...patient,
      status: patient.status === visitStatus(appointment) ? 'Waiting' : patient.status,
      appointments: (patient.appointments || []).filter((entry) => entry.sourceAppointmentId !== appointment.id),
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
          <label className="medsec-field wide"><span>Search bookings</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Patient, doctor, ID, or type" /></label>
          <label className="medsec-field"><span>Date</span><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></label>
          <label className="medsec-field"><span>Visit status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {['All', 'Waiting', 'In Consultation', 'Completed', 'Open', 'Cancelled'].map((value) => <option key={value}>{value}</option>)}
          </select></label>
        </div>
        <div className="medsec-list">
          {filtered.map((item) => {
            const status = item.status === 'Open' || item.status === 'Cancelled' ? item.status : visitStatus(item);
            return <button key={item.id} type="button" className={`medsec-list-item ${selectedId === item.id ? 'active' : ''}`}
              onClick={() => { setSelectedId(item.id); setFormMode(null); setError(''); setMessage(''); }}>
              <span><strong>{item.patientName || 'Open slot'}</strong><small>{displayDate(item.date)} · {displayTime(item.time)} · {item.doctor}</small></span>
              <span className={`medsec-badge ${status === 'Completed' ? 'completed' : status === 'In Consultation' ? 'consultation' : ''}`}>{status}</span>
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
          <p className="medsec-muted">Available times use the doctor schedule and exclude booked or blocked slots.</p>
          <form onSubmit={saveBooking}>
            <div className="medsec-form-grid">
              <label className="medsec-field wide"><span>Patient profile</span><select required value={form.patientId} onChange={(event) => setForm({ ...form, patientId: event.target.value })}>
                <option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} ({patient.id})</option>)}
              </select></label>
              <label className="medsec-field"><span>Doctor</span><select value={form.doctor} onChange={(event) => setForm({ ...form, doctor: event.target.value, time: '' })}>
                {doctors.map((doctor) => <option key={doctor}>{doctor}</option>)}
              </select></label>
              <label className="medsec-field"><span>Date</span><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value, time: '' })} /></label>
              <label className="medsec-field"><span>30-minute slot</span><select required value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })}>
                <option value="">Select available time</option>{formSlots.map((slot) => <option key={slot} value={slot}>{displayTime(slot)}</option>)}
              </select></label>
              <label className="medsec-field"><span>Visit type</span><input required value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} /></label>
              <label className="medsec-field wide"><span>Booking notes</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            </div>
            <p className="medsec-muted">{formSlots.length} free slots · {displayTime(currentSchedule.start)}–{displayTime(currentSchedule.end)}
              {schedules[`${form.doctor}|${form.date}`] ? ' (saved availability)' : ' (default availability)'}</p>
            {!formSlots.length && <p className="medsec-notice">No free times. Change the date or adjust availability in Doctor Schedules.</p>}
            {error && <p className="medsec-error" role="alert">{error}</p>}
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
          <span className={`medsec-badge ${visitStatus(selected) === 'Completed' ? 'completed' : visitStatus(selected) === 'In Consultation' ? 'consultation' : ''}`}>{selected.status === 'Open' ? 'Open' : selected.status === 'Cancelled' ? 'Cancelled' : visitStatus(selected)}</span>
          <div className="medsec-info-row"><span>Date and time</span><span>{displayDate(selected.date)} · {displayTime(selected.time)}</span></div>
          <div className="medsec-info-row"><span>Doctor</span><span>{selected.doctor}</span></div>
          <div className="medsec-info-row"><span>Visit type</span><span>{selected.type}</span></div>
          <div className="medsec-info-row"><span>Room</span><span>{selected.room || 'To be assigned'}</span></div>
          <div className="medsec-info-row"><span>Booking notes</span><span>{selected.notes || 'None'}</span></div>
          {selected.status === 'Open' ? <div className="medsec-actions"><button type="button" className="medsec-btn" onClick={() => startForm('open', selected)}>Book This Slot</button></div> : <>
            <div className="medsec-section-divider" />
            {linkedPatient ? <div className="medsec-actions"><button type="button" className="medsec-btn secondary" onClick={() => onNavigate('patients', { patientId: linkedPatient.id,
              tab: visitStatus(selected) === 'Completed' ? 'visits' : 'consultation' })}>Open Linked Patient Visit</button></div>
              : <label className="medsec-field"><span>Link a patient profile</span><select value="" onChange={(event) => linkPatient(event.target.value)}><option value="">Choose a patient</option>
                {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} ({patient.id})</option>)}</select></label>}
            {selected.status !== 'Cancelled' && <>
              <h3>Visit progress</h3>
              <div className="medsec-progress">{progress.map((step, index) => <React.Fragment key={step}>
                {index > 0 && <span aria-hidden="true">→</span>}
                <span className={`medsec-progress-step ${progress.indexOf(visitStatus(selected)) > index ? 'done' : progress.indexOf(visitStatus(selected)) === index ? 'active' : ''}`}>{step}</span>
              </React.Fragment>)}</div>
              {visitStatus(selected) !== 'Completed' && <button type="button" className="medsec-btn" onClick={advance} disabled={!linkedPatient}
                title={!linkedPatient ? 'Link a patient profile first' : undefined}>
                {visitStatus(selected) === 'Waiting' ? 'Start Consultation' : 'Mark Completed'}
              </button>}
              {!linkedPatient && <p className="medsec-notice">Link a patient profile before advancing this visit.</p>}
            </>}
            {visitStatus(selected) !== 'Completed' && <div className="medsec-actions">
              <button type="button" className="medsec-btn secondary" onClick={() => startForm('edit', selected)}>Edit / Reschedule</button>
            </div>}
          </>}
          {message && <p className="medsec-notice" role="status">{message}</p>}
        </> : <div><h2>Select a booking</h2><p className="medsec-muted">Choose an appointment to view its linked patient and update the visit.</p></div>}
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
