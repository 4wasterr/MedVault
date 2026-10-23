import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer, normalizePath } from 'vite';
import { draftKey, writeDraft } from './draftStorage.js';
import { clinicToday } from '../../shared/formRules.mjs';

test('actual forms render restored drafts, constrained date/time inputs, vital controls, and unique visits', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const server = await createServer({ root, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  globalThis.window = { localStorage: storage, location: { search: '' } };
  try {
    const { DraftScope } = await server.ssrLoadModule(normalizePath(path.join(root, 'src/useDraftState.js')));
    const load = async file => (await server.ssrLoadModule(normalizePath(path.join(root, '../pages', file)))).default;
    const render = (Component, props, scope = 'Receptionist:alice') => renderToString(React.createElement(DraftScope.Provider, { value: scope }, React.createElement(Component, props)));
    const save = (name, value, scope = 'Receptionist:alice') => writeDraft(storage, draftKey(scope, name), value);
    const patient = { id: 'P1', name: 'Draft Patient', age: '35', birthday: '1990-01-01', contact: '+639171234567',
      emergencyContact: '+639181234567', emergencyRelationship: 'Sibling', email: 'patient@gmail.com', vitals: {}, appointments: [] };
    const props = { patients: [patient], appointments: [], doctors: [{ id: 'D1', name: 'Dr. Cruz', active: true }], schedules: {}, onNavigate() {}, onLogout() {}, setPatients() {}, setAppointments() {}, setSchedules() {} };
    const App = (await server.ssrLoadModule(normalizePath(path.join(root, 'src/App.jsx')))).default;
    assert.match(render(App, {}), /Loading MedVault/);

    const Appointment = await load('receptionist/appointment.jsx');
    save('appointments:showNewModal', true);
    save('appointments:newForm', { patientId: '', patientName: 'Restored appointment', date: '2050-01-01', time: '09:17', doctor: 'Dr. Cruz', type: 'Follow-up', notes: 'Restored intake note' });
    let html = render(Appointment, props);
    assert.match(html, /Restored intake note/);
    assert.match(html, /type="date"[^>]*min="[0-9-]+"/);
    assert.match(html, /type="time" step="60"[^>]*value="09:17"/);
    assert.match(html, /Emergency contact relationship/);
    save('appointments:showNewModal', false);
    save('appointments:showEditModal', true);
    save('appointments:editForm', { id: 'A1', patientName: 'Patient', date: '2050-01-01', time: '09:17', doctor: 'Dr. Cruz', type: 'Follow-up', status: 'Confirmed' });
    html = render(Appointment, props);
    assert.match(html, /Date \*/);
    assert.match(html, /type="date"[^>]*min="[0-9-]+"/);

    const Registration = await load('receptionist/patientsModuleReceptionist.jsx');
    save('patients:showRegisterModal', true);
    save('patients:registerForm', { firstName: 'Restored registration', age: '0', birthday: clinicToday(), emergencyRelationship: 'Parent' });
    html = render(Registration, props);
    assert.match(html, /Restored registration/);
    assert.match(html, /type="number" min="0" max="130" step="1" required/);
    assert.match(html, /type="date" min="1900-01-01" max="[0-9-]+"/);

    const Dashboard = await load('receptionist/receptionistDashboard.jsx');
    save('dashboard:activeModal', 'register');
    save('dashboard:registerFormData', { firstName: 'Dashboard draft', age: '0', birthday: clinicToday(), emergencyRelationship: 'Parent' });
    html = render(Dashboard, props);
    assert.match(html, /Dashboard draft/);
    assert.match(html, /type="number" min="0" max="130" step="1" required/);
    assert.match(html, /Emergency contact relationship/);
    save('dashboard:activeModal', 'appointment');
    save('dashboard:appointmentForm', { patientId: 'P1', doctor: 'Dr. Cruz', date: '2050-01-01', time: '09:17', type: 'Follow-up' });
    html = render(Dashboard, props);
    assert.match(html, /<input(?=[^>]*type="date")(?=[^>]*min="[0-9-]+")[^>]*>/);
    assert.match(html, /type="time" step="60"[^>]*value="09:17"/);
    assert.match(html, /<option[^>]*>Emergency<\/option>/);

    const Records = await load('medical secretary/MedSecPatientRecords.jsx');
    html = render(Records, { ...props, selectedPatientId: 'P1', initialTab: 'vitals' }, 'Medical Secretary:bob');
    assert.match(html, /<input(?=[^>]*type="number")(?=[^>]*min="30")(?=[^>]*max="220")[^>]*>/);
    assert.match(html, /<input(?=[^>]*type="number")(?=[^>]*min="34")(?=[^>]*max="42")[^>]*>/);
    const visit = { id: 'visit-A1', appointmentId: 'A1', date: '2050-01-01', doctor: 'Dr. Cruz', type: 'Follow-up' };
    html = render(Records, { ...props, patients: [{ ...patient, visits: [visit, { ...visit }] }], selectedPatientId: 'P1', initialTab: 'visits' }, 'Medical Secretary:bob');
    assert.equal((html.match(/class="medsec-visit-card"/g) || []).length, 1);
    assert.match(html, /type="date"/);
    assert.match(html, /<option[^>]*>Emergency<\/option>/);

    const Booking = await load('medical secretary/MedSecAppointment.jsx');
    save('secretary-booking:formMode', { kind: 'new' }, 'Medical Secretary:bob');
    html = render(Booking, props, 'Medical Secretary:bob');
    assert.match(html, /type="time" step="60"/);
    assert.match(html, /type="date"[^>]*min="[0-9-]+"/);
    assert.match(render(await load('medical secretary/MedSecDoctorSchedules.jsx'), props, 'Medical Secretary:bob'), /type="time" step="60"/);
    assert.match(render(await load('receptionist/Signup.jsx'), { onBack() {} }), /type="email"/);
    assert.match(render(await load('super admin/AdminUserManagement.jsx'), { accounts: [], onRefresh() {} }), /Staff Accounts/);
    assert.match(render(await load('super admin/AdminDoctorManagement.jsx'), { doctors: [], accounts: [], onRefresh() {} }), /Doctor Profiles/);
  } finally {
    delete globalThis.window;
    await server.close();
  }
});
