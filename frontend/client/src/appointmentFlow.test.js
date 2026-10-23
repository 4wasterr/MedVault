import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer, normalizePath } from 'vite';
import { bookingPatient, selectBookingPatient, updatePatientBooking } from './appointmentBooking.js';
import { draftKey, writeDraft } from './draftStorage.js';
import { clinicToday } from '../../shared/formRules.mjs';

const patient = {
  id: 'P1', name: 'Maria Cruz', age: 0, contact: '+639171234567',
  emergencyName: 'Ana Cruz', emergencyContact: '+639181234567', emergencyRelationship: 'Parent',
  birthday: '', medical: { allergies: 'Existing clinical history' }, appointments: [],
};

test('patient selection fills every required intake field and switching to new clears identity and demographics', () => {
  const form = { patientId: 'P2', patientName: 'Other Patient', age: '40', doctor: 'Dr. Cruz', date: '2050-01-01', time: '09:17', type: 'Follow-up' };
  const selected = selectBookingPatient(form, patient);
  assert.equal(selected.patientId, patient.id);
  assert.equal(selected.age, 0);
  assert.equal(selected.emergencyContact, patient.emergencyContact);
  assert.equal(selected.emergencyRelationship, 'Parent');
  assert.equal(selected.time, '09:17');
  const cleared = selectBookingPatient(selected);
  for (const field of ['patientId', 'patientName', 'age', 'contact', 'emergencyName', 'emergencyContact', 'emergencyRelationship']) assert.equal(cleared[field], '');
  assert.equal(cleared.doctor, 'Dr. Cruz');
});

test('booking an existing patient preserves identity and clinical data while saving completed intake once', () => {
  const form = { ...selectBookingPatient({}, patient), patientName: 'Accidental renamed appointment', contact: '+639191234567', emergencyRelationship: 'Guardian' };
  const updatedPatient = bookingPatient(form, patient, 'SHOULD-NOT-BECOME-A-NEW-PATIENT');
  assert.equal(updatedPatient.id, 'P1');
  assert.equal(updatedPatient.name, 'Maria Cruz');
  assert.deepEqual(updatedPatient.medical, patient.medical);
  assert.equal(updatedPatient.contact, '+63 919 123 4567');
  const appointment = { id: 'A1', date: '2050-01-01', doctor: 'Dr. Cruz', type: 'Follow-up', specialty: 'General Health' };
  const existing = { ...patient, appointments: [{ id: 'A1' }, { sourceAppointmentId: 'A1' }, { id: 'A2', notes: 'Keep separate visit' }] };
  const records = updatePatientBooking([existing, { id: 'P2', name: 'Other Patient' }], updatedPatient, appointment);
  assert.equal(records.length, 2);
  assert.equal(records[0].emergencyRelationship, 'Guardian');
  assert.equal(records[0].appointments.length, 2);
  assert.equal(records[0].appointments[0].specialty, 'General Health');
  assert.equal(records[0].appointments[1].notes, 'Keep separate visit');
  assert.equal(records[1].id, 'P2');
  const fresh = bookingPatient({ ...form, patientName: '  New Patient  ' }, undefined, 'P3', '2050-01-01T00:00:00Z');
  assert.equal(fresh.id, 'P3');
  assert.equal(fresh.name, 'New Patient');
  assert.equal(updatePatientBooking(records, fresh, { ...appointment, id: 'A3' }).length, 3);
});

test('actual appointment forms keep existing patient intake visible, match specialties to doctors, and show saved rows', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const server = await createServer({ root, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  globalThis.window = { localStorage: storage, location: { search: '' } };
  try {
    const load = async file => (await server.ssrLoadModule(normalizePath(path.join(root, '../pages', file)))).default;
    const Fields = await load('components/AppointmentBookingFields.jsx');
    const doctors = [
      { id: 'D1', name: 'Dr. Cruz', specialty: 'General Health', active: true },
      { id: 'D2', name: 'Dr. Reyes', specialty: 'Cardiologist', active: true },
      { id: 'D3', name: 'Dr. Retired', specialty: 'Cardiologist', active: false },
    ];
    let form = { ...selectBookingPatient({}, patient), date: clinicToday(), time: '09:17', type: 'Follow-up', doctor: 'Dr. Cruz', room: 'General Intake A' };
    const setForm = updater => { form = typeof updater === 'function' ? updater(form) : updater; };
    const fields = () => Fields({ form, setForm, patients: [patient], doctors });
    const find = (element, label) => {
      if (!element || typeof element !== 'object') return null;
      if (element.props?.['aria-label'] === label) return element;
      for (const child of React.Children.toArray(element.props?.children)) {
        const match = find(child, label);
        if (match) return match;
      }
      return null;
    };
    assert.equal(find(fields(), 'Patient name').props.readOnly, true);
    find(fields(), 'Visit specialty').props.onChange({ target: { value: 'Cardiologist' } });
    assert.equal(form.specialty, 'Cardiologist');
    assert.equal(form.doctor, 'Dr. Reyes');
    assert.equal(form.time, '');
    const html = renderToString(React.createElement(Fields, { form, setForm, patients: [patient], doctors }));
    assert.match(html, /<option value="Cardiologist" selected="">Cardiology<\/option>/);
    assert.match(html, /aria-label="Age"[^>]*value="0"/);
    assert.match(html, /<legend>Emergency contact information<\/legend>[\s\S]*Emergency contact relationship/);
    assert.match(html, /\+63 917 123 4567/);
    const doctorSelect = find(fields(), 'Attending doctor');
    const options = React.Children.toArray(doctorSelect.props.children).map(option => option.props.value);
    assert.deepEqual(options, ['', 'Dr. Reyes']);
    const slotFields = Fields({ form, setForm, patients: [patient], doctors, slot: { date: clinicToday(), time: '09:17 AM', doctor: 'Dr. Reyes', room: 'Consultation Room 1' } });
    assert.equal(find(slotFields, 'Visit specialty').props.disabled, true);
    assert.equal(find(slotFields, 'Attending doctor').props.disabled, true);
    assert.equal(find(slotFields, 'Appointment date').props.readOnly, true);
    assert.equal(find(slotFields, 'Appointment time').props.readOnly, true);

    const { DraftScope } = await server.ssrLoadModule(normalizePath(path.join(root, 'src/useDraftState.js')));
    const Appointment = await load('receptionist/appointment.jsx');
    const scope = 'Receptionist:appointment-regression';
    const save = (name, value) => writeDraft(storage, draftKey(scope, name), value);
    const appointment = { id: 'A1', patientId: 'P1', patientName: patient.name, age: 0, date: clinicToday(), time: '09:17 AM', contact: patient.contact,
      emergencyName: patient.emergencyName, emergencyContact: patient.emergencyContact, emergencyRelationship: 'Parent',
      doctor: 'Dr. Reyes', specialty: 'Cardiologist', type: 'Follow-up', status: 'Confirmed', room: 'Consultation Room 1' };
    save('appointments:selectedAppointment', appointment);
    save('appointments:activeTab', 'patientInfo');
    save('appointments:showNewModal', true);
    save('appointments:newForm', { ...form, time: '09:17' });
    const rendered = renderToString(React.createElement(DraftScope.Provider, { value: scope }, React.createElement(Appointment, {
      patients: [patient], appointments: [appointment], doctors, schedules: {},
    })));
    assert.match(rendered, /class="ap-table-row selected /);
    assert.match(rendered, /Cardiology/);
    assert.match(rendered, /0 years old/);
    assert.match(rendered, /Parent/);
    assert.match(rendered, /aria-label="Age"/);
    assert.match(rendered, /That time is booked or blocked in Doctor Schedules/);
    assert.doesNotMatch(rendered, /View Full Patient Profile|Drafts are saved/);
    save('appointments:showNewModal', false);
    const progressRows = renderToString(React.createElement(DraftScope.Provider, { value: scope }, React.createElement(Appointment, {
      patients: [patient], doctors, appointments: ['Waiting', 'In Consultation', 'Completed'].map((status, index) => ({ ...appointment, id: `progress-${index}`, status })),
    })));
    for (const statusClass of ['waiting', 'consultation', 'completed']) assert.match(progressRows, new RegExp(`class="ap-badge ${statusClass}"`));

    const Secretary = await load('medical secretary/MedSecAppointment.jsx');
    const secretaryScope = 'Medical Secretary:arrival-regression';
    writeDraft(storage, draftKey(secretaryScope, 'secretary-booking:selectedId'), appointment.id);
    const renderSecretary = (status, visitStatus = 'Waiting') => renderToString(React.createElement(DraftScope.Provider, { value: secretaryScope },
      React.createElement(Secretary, { patients: [patient], doctors, appointments: [{ ...appointment, status, visitStatus }], schedules: {} })));
    const scheduled = renderSecretary('Confirmed');
    assert.match(scheduled, />Check-In<\/button>/);
    assert.match(scheduled, /Awaiting arrival/);
    assert.doesNotMatch(scheduled, />Start Consultation<\/button>/);
    const arrived = renderSecretary('Checked-In');
    assert.match(arrived, />Start Consultation<\/button>/);
    assert.match(arrived, />Undo Check-In<\/button>/);
    const consulting = renderSecretary('In Consultation', 'In Consultation');
    assert.match(consulting, />Mark Completed<\/button>/);
    assert.doesNotMatch(consulting, />Undo Check-In<\/button>|>Edit \/ Reschedule<\/button>/);
    assert.doesNotMatch(renderSecretary('Completed', 'Completed'), />Mark Completed<\/button>/);
  } finally {
    delete globalThis.window;
    await server.close();
  }
});
