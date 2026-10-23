import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer, normalizePath } from 'vite';
import { dashboardData, registrationDate } from './dashboardData.js';
import { isPersonName, nameProblem, personName, ROOMS } from '../../shared/formRules.mjs';
import { fieldProblem } from './formFeedback.js';

test('emergency contact names tolerate the spaces produced by an omitted middle name', () => {
  for (const name of ['Anne Smith', 'Anne  Smith', '  Anne Smith  ', 'José Dela Cruz', "Anne O’Neil", 'Anne M. Smith']) {
    assert.equal(isPersonName(name), true, name);
    assert.equal(nameProblem(name, { optional: true, max: 160 }), null);
    const field = { value: name, dataset: { personName: 'true' }, validity: {}, labels: [], closest: () => null, getAttribute: () => 'Emergency contact name' };
    assert.equal(fieldProblem(field), '');
  }
  for (const name of ['Anne123 Smith', 'Anne @ Smith']) assert.equal(isPersonName(name), false);
  assert.equal(personName('Anne', '', 'Smith'), 'Anne Smith');
  assert.equal(personName('  Anne  ', undefined, ' Smith '), 'Anne Smith');
});

test('dashboard counts and chart activity reflect registration, reloads, booking, and visit progress', () => {
  const patients = [{ id: 'P1', status: 'Waiting', createdAt: '2026-10-22T16:01:00Z' }];
  assert.equal(registrationDate(patients[0]), '2026-10-23');
  const summary = dashboardData(JSON.parse(JSON.stringify(patients)), [], '2026-10-23');
  assert.equal(summary.newPatients, 1);
  assert.equal(summary.waiting, 0);
  assert.equal(summary.activity.length, 1);
  const appointment = { id: 'A1', patientId: 'P1', date: '2026-10-23', status: 'Confirmed' };
  assert.equal(dashboardData(patients, [appointment], '2026-10-23').waiting, 0);
  assert.equal(dashboardData(patients, [{ ...appointment, status: 'Checked-In', visitStatus: 'Waiting' }], '2026-10-23').waiting, 1);
  assert.equal(dashboardData(patients, [appointment], '2026-10-23').activity.length, 1);
  assert.equal(dashboardData(patients, [{ ...appointment, visitStatus: 'Completed' }], '2026-10-23').waiting, 0);
  assert.equal(dashboardData(patients, [appointment], '2026-10-24').newPatients, 0);
  assert.equal(dashboardData(patients, [{ ...appointment, status: 'Open', patientId: '' }], '2026-10-23').activity.length, 1);
});

test('real dashboard cards are informational and every room assignment lists Room 1 through Room 5', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const server = await createServer({ root, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'silent' });
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => null }, location: { search: '' } };
  try {
    const load = async file => (await server.ssrLoadModule(normalizePath(path.join(root, '../pages', file)))).default;
    const { CurrentUserContext } = await server.ssrLoadModule(normalizePath(path.join(root, 'src/currentUser.jsx')));
    const profile = { username: 'anne.smith', role: 'Receptionist', firstName: 'Anne', lastName: 'Smith', displayName: 'Anne Smith' };
    const render = (Component, props) => renderToString(React.createElement(CurrentUserContext.Provider, { value: profile }, React.createElement(Component, props)));
    const patient = { id: 'P1', name: 'Test Patient', status: 'Waiting', createdAt: new Date().toISOString() };
    const props = { patients: [patient], appointments: [], doctors: [], schedules: {} };
    const dashboard = render(await load('receptionist/receptionistDashboard.jsx'), props);
    assert.match(dashboard.replace(/<!-- -->/g, ''), /Welcome Back, Anne Smith/);
    const cards = dashboard.match(/<div class="kpi-card"[^>]*>/g);
    assert.equal(cards.length, 4);
    for (const card of cards) { assert.match(card, /role="group"/); assert.doesNotMatch(card, /tabindex|role="button"/); }
    assert.match(dashboard, /aria-label="New Patients Today"[\s\S]*?class="kpi-digit">1</);
    for (const file of ['receptionist/patientsModuleReceptionist.jsx', 'receptionist/appointment.jsx', 'medical secretary/MedSecShell.jsx', 'super admin/AdminShell.jsx']) {
      const html = render(await load(file), props);
      assert.match(html, />AS<\/span>/, file);
    }
    const Fields = await load('components/AppointmentBookingFields.jsx');
    for (const slot of [undefined, { room: 'General Intake A', date: '2050-01-01', time: '09:00' }]) {
      const html = render(Fields, { ...props, form: { room: 'Room 5' }, slot });
      const roomSelect = html.match(/<select aria-label="Room assignment"[\s\S]*?<\/select>/)[0];
      for (const room of ROOMS) assert.match(roomSelect, new RegExp(`>${room}<`));
      assert.equal((roomSelect.match(/<option/g) || []).length, 5);
      assert.doesNotMatch(roomSelect, /General Intake|Consultation Room/);
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    await server.close();
  }
});
