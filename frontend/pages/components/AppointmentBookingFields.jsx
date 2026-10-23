import React from 'react';
import './PatientIdentityNotice.css';
import PatientIntakeFields from './PatientIntakeFields';
import { PHONE_PATTERN, SPECIALTIES, VISIT_TYPES, ROOMS, normalizeRoom, formatPhone, phoneInput, specialtyLabel } from '../../shared/formRules.mjs';
import { selectBookingPatient, doctorSpecialty, appointmentSpecialty, duplicateBookingPatient } from '../../client/src/appointmentBooking';
import { duplicatePatientMessage } from '../../shared/patientIdentity.mjs';
import { dateKey, timeKey, todayISO } from '../medical secretary/medsecData';
import '../receptionist/appointment.css';
import { CLINIC_OPEN, LAST_APPOINTMENT, isDoctorActive } from '../../shared/schedulingRules.mjs';
import { isPatientArchived } from '../../shared/patientArchive.mjs';

export default function AppointmentBookingFields({ form, setForm, patients, doctors, slot }) {
  const specialty = appointmentSpecialty(form, doctors);
  const matchingDoctors = doctors.filter(doctor => isDoctorActive(doctor) && doctorSpecialty(doctor) === specialty);
  const duplicate = duplicateBookingPatient(form, patients);
  const change = (key, value) => setForm(current => ({ ...current, [key]: value }));
  return <>
    <fieldset className="ap-booking-section">
      <legend>Patient information</legend>
      <div className="ap-form-grid-2">
        <label className="ap-form-field full-width"><span className="ap-form-label">Patient *</span>
          <select aria-label="Patient" className="ap-form-select" value={form.patientId || ''}
            onChange={event => setForm(current => selectBookingPatient(current, patients.find(patient => patient.id === event.target.value)))}>
            <option value="">Register a new patient</option>
            {patients.filter(patient => !isPatientArchived(patient)).map(patient => <option key={patient.id} value={patient.id}>{patient.name} ({patient.id})</option>)}
          </select>
        </label>
        <label className="ap-form-field"><span className="ap-form-label">Patient Name *</span>
          <input aria-label="Patient name" type="text" required autoFocus={!form.patientId} placeholder="Enter patient name" className="ap-form-input"
            value={form.patientName || ''} readOnly={Boolean(form.patientId)} onChange={event => change('patientName', event.target.value)} />
        </label>
        <label className="ap-form-field"><span className="ap-form-label">Contact Number *</span>
          <input aria-label="Contact number" type="tel" required pattern={PHONE_PATTERN} maxLength="16" placeholder="+63 917 123 4567" className="ap-form-input"
            value={formatPhone(form.contact)} onChange={event => change('contact', phoneInput(event.target.value))} />
        </label>
        {duplicate && <div className="ap-duplicate-patient" role="alert">
          <p>{duplicatePatientMessage(duplicate)}</p>
          <button type="button" className="ap-btn-cancel" onClick={() => setForm(current => selectBookingPatient(current, duplicate))}>Use existing patient</button>
        </div>}
        <PatientIntakeFields value={form} onChange={change} />
      </div>
    </fieldset>
    <fieldset className="ap-booking-section">
      <legend>Visit information</legend>
      <div className="ap-form-grid-2">
        <label className="ap-form-field"><span className="ap-form-label">Visit specialty *</span>
          <select aria-label="Visit specialty" required disabled={Boolean(slot?.doctor)} className="ap-form-select" value={specialty} onChange={event => {
            const selectedSpecialty = event.target.value;
            const doctor = doctors.find(item => isDoctorActive(item) && doctorSpecialty(item) === selectedSpecialty);
            setForm(current => ({ ...current, specialty: selectedSpecialty, doctor: doctor?.name || '', ...(!slot ? { time: '' } : {}) }));
          }}>{SPECIALTIES.map(item => <option key={item} value={item}>{specialtyLabel(item)}</option>)}</select>
        </label>
        <label className="ap-form-field"><span className="ap-form-label">Appointment Type *</span>
          <select aria-label="Appointment type" required className="ap-form-select" value={form.type} onChange={event => change('type', event.target.value)}>
            {VISIT_TYPES.map(item => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="ap-form-field"><span className="ap-form-label">Attending Doctor *</span>
          <select aria-label="Attending doctor" required disabled={Boolean(slot?.doctor)} className="ap-form-select" value={form.doctor || ''} onChange={event => setForm(current => ({ ...current, doctor: event.target.value, ...(!slot ? { time: '' } : {}) }))}>
            <option value="">Select doctor</option>{matchingDoctors.map(doctor => <option key={doctor.id || doctor.name} value={doctor.name}>{doctor.name}</option>)}
          </select>
          {!matchingDoctors.length && <span className="ap-field-hint">No active doctor is available for this specialty.</span>}
        </label>
        <label className="ap-form-field"><span className="ap-form-label">Room Assignment</span>
          <select aria-label="Room assignment" className="ap-form-select" value={normalizeRoom(form.room || slot?.room)} onChange={event => change('room', event.target.value)}>
            {ROOMS.map(room => <option key={room}>{room}</option>)}
          </select>
        </label>
        <label className="ap-form-field"><span className="ap-form-label">Date *</span>
          <input aria-label="Appointment date" type="date" min={todayISO()} required readOnly={Boolean(slot)} className="ap-form-input" value={dateKey(slot?.date || form.date)}
            onChange={event => setForm(current => ({ ...current, date: event.target.value, time: '' }))} />
        </label>
        <label className="ap-form-field"><span className="ap-form-label">Time Slot *</span>
          <input aria-label="Appointment time" type="time" step="60" min={CLINIC_OPEN} max={LAST_APPOINTMENT} required readOnly={Boolean(slot)} className="ap-form-input" value={timeKey(slot?.time || form.time)} onChange={event => change('time', event.target.value)} />
        </label>
        <label className="ap-form-field full-width"><span className="ap-form-label">Intake Notes / Chief Complaint</span>
          <textarea placeholder="Reason for visit or clinical intake details..." className="ap-form-textarea" value={form.notes || ''} onChange={event => change('notes', event.target.value)} />
        </label>
      </div>
    </fieldset>
    <p className="ap-field-hint">Appointments last 30 minutes. Clinic hours are 8:00 AM–5:00 PM; the last appointment starts at 4:30 PM.</p>
  </>;
}
