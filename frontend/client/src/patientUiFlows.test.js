import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer, normalizePath } from 'vite';
import { draftKey, writeDraft } from './draftStorage.js';

test('patient entry points share visit fields and keep emergency relationship in emergency information', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const server = await createServer({ root, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: storage, location: { search: '' } };
  const scope = 'Receptionist:ui-regression';
  const save = (name, value) => writeDraft(storage, draftKey(scope, name), value);
  try {
    const { DraftScope } = await server.ssrLoadModule(normalizePath(path.join(root, 'src/useDraftState.js')));
    const load = async file => (await server.ssrLoadModule(normalizePath(path.join(root, '../pages', file)))).default;
    const render = (Component, props) => renderToString(React.createElement(DraftScope.Provider, { value: scope }, React.createElement(Component, props)));
    const patient = { id: 'P1', name: 'Infant Cruz', age: 0, sex: '', contact: '+639171234567',
      emergencyName: 'Maria Cruz', emergencyContact: '+639181234567', emergencyRelationship: 'Parent', specialty: 'Cardiologist', appointments: [] };
    const props = { patients: [patient], appointments: [], doctors: [{ id: 'D1', name: 'Doctor Cruz', specialty: 'Cardiologist', active: true }],
      onNavigate() {}, onLogout() {}, setPatients() {}, setAppointments() {} };
    const registration = { firstName: 'Infant', lastName: 'Cruz', age: 0, contactNumber: patient.contact,
      emergContactNumber: patient.emergencyContact, emergencyRelationship: 'Parent', specialty: 'Cardiologist' };
    save('patients:showRegisterModal', true);
    save('patients:registerForm', registration);
    save('dashboard:activeModal', 'register');
    save('dashboard:registerFormData', registration);
    const Patients = await load('receptionist/patientsModuleReceptionist.jsx');
    const Dashboard = await load('receptionist/receptionistDashboard.jsx');
    for (const html of [render(Patients, props), render(Dashboard, props)]) {
      const emergencyStart = html.indexOf('Emergency Contact Information');
      const relationship = html.indexOf('Emergency contact relationship');
      assert.ok(emergencyStart >= 0 && relationship > emergencyStart);
      assert.doesNotMatch(html.slice(0, emergencyStart), /name="emergencyRelationship"/);
      assert.match(html, /name="specialty"/);
      assert.match(html, /value="Cardiologist" selected="">Cardiology/);
      assert.match(html, /value="\+63 917 123 4567"/);
      assert.doesNotMatch(html, /Drafts are saved on this device/);
      assert.match(html, /already has a patient record/);
      assert.match(html, /type="button"[^>]*>Use existing patient/);
    }

    save('patients:showRegisterModal', false);
    save('patients:selectedPatient', patient);
    const profile = render(Patients, props);
    assert.match(profile, /Emergency Contact Information/);
    assert.match(profile, /Relationship<\/span><span class="pm-info-val">Parent/);
    assert.match(profile, /Age<\/span><span class="pm-info-val">0/);
    assert.match(profile, /\+63 918 123 4567/);
    assert.doesNotMatch(profile, /0 years old \| Male/);

    save('dashboard:activeModal', 'appointment');
    // A draft from the former dashboard form must populate the newly visible intake.
    save('dashboard:appointmentForm', { patientId: patient.id, doctor: 'Doctor Cruz', date: '2050-01-01', time: '09:30', type: 'Follow-up' });
    const booking = render(Dashboard, props);
    assert.match(booking, /aria-label="Patient name"[^>]*readOnly=""[^>]*value="Infant Cruz"/);
    assert.match(booking, /aria-label="Emergency contact number"[^>]*value="\+63 918 123 4567"/);
    assert.match(booking, /aria-label="Visit specialty"/);

    const RegistrationFields = await load('components/PatientRegistrationFields.jsx');
    const BookingFields = await load('components/AppointmentBookingFields.jsx');
    const find = (element, predicate) => {
      if (!element || typeof element !== 'object') return null;
      if (predicate(element)) return element;
      for (const child of React.Children.toArray(element.props?.children)) {
        const match = find(child, predicate);
        if (match) return match;
      }
      return null;
    };
    let selectedRegistration;
    const registrationFields = RegistrationFields({ value: registration, patients: [patient], onChange() {}, onUseExisting: existing => { selectedRegistration = existing; } });
    find(registrationFields, element => element.type === 'button' && element.props.children === 'Use existing patient').props.onClick();
    assert.equal(selectedRegistration.id, patient.id);

    let bookingForm = { patientId: '', patientName: patient.name, contact: '09171234567', age: 50, emergencyName: 'Stale Person', emergencyContact: '', emergencyRelationship: '' };
    const fields = () => BookingFields({ form: bookingForm, setForm: updater => { bookingForm = updater(bookingForm); }, patients: [patient], doctors: props.doctors });
    find(fields(), element => element.type === 'button' && element.props.children === 'Use existing patient').props.onClick();
    assert.equal(bookingForm.patientId, patient.id);
    assert.equal(bookingForm.age, 0);
    assert.equal(bookingForm.emergencyName, patient.emergencyName);
    assert.equal(bookingForm.emergencyRelationship, 'Parent');
    assert.equal(find(fields(), element => element.type === 'button' && element.props.children === 'Use existing patient'), null);
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    await server.close();
  }
});
