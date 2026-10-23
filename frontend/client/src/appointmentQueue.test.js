import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer, normalizePath } from 'vite';
import { compareRecordsNewestFirst, newestRecordsFirst, stampChangedRecords } from '../../shared/recordOrdering.mjs';
import { filterAppointmentQueue, appointmentGroup } from '../../shared/appointmentQueue.mjs';
import { appointmentStage } from '../../shared/appointmentWorkflow.mjs';
import { applyChanges, changesBetween } from './sharedState.js';

test('newest patient and record ordering prioritizes updates, survives replay, and preserves creation dates', () => {
  const old = { id: 'old', name: 'Older Patient', createdAt: '2026-01-01T00:00:00Z' };
  const recent = { id: 'new', name: 'New Patient', createdAt: '2026-10-24T01:00:00Z' };
  const records = [old, recent];
  assert.deepEqual(newestRecordsFirst(records).map(item => item.id), ['new', 'old']);
  assert.equal(records[0], old);
  const stamped = stampChangedRecords(records, [{ ...old, name: 'Updated Patient' }, recent], '2026-10-24T02:00:00Z');
  assert.equal(stamped[0].id, old.id);
  assert.equal(stamped[0].createdAt, old.createdAt);
  assert.equal(stamped[0].lastUpdatedAt, '2026-10-24T02:00:00Z');
  assert.equal(stamped[1], recent);
  const state = { patients: records, appointments: [], schedules: {}, doctors: [] };
  const replay = applyChanges(state, changesBetween(state, { ...state, patients: stamped }));
  assert.deepEqual(replay.patients, stamped);
  assert.ok(compareRecordsNewestFirst({ updated_at: '2026-10-24T03:00:00Z' }, recent) < 0);
  assert.deepEqual(newestRecordsFirst([{ id: 'legacy-new', createdAt: 'invalid' }, { id: 'legacy-old' }]).map(item => item.id), ['legacy-new', 'legacy-old']);
});

const booking = (id, status, extra = {}) => ({ id, patientName: `${id} Patient`, doctor: 'Dr. Cruz', room: 'Room 2', type: 'Follow-up',
  date: '2050-01-01', time: '09:00', status, createdAt: '2026-10-24T01:00:00Z', ...extra });

test('active, completed, and cancellation archives classify both current and legacy terminal statuses', () => {
  const active = ['Open', 'Confirmed', 'Checked-In', 'Waiting', 'In Consultation'].map(status => booking(status, status));
  const completed = [booking('completed', 'Completed'), booking('done', 'Done'), booking('legacy-completed', 'Checked-In', { visitStatus: 'Completed' }), booking('legacy-done', 'Waiting', { visitStatus: 'Done' })];
  const cancelled = [booking('cancelled', 'Cancelled', { visitStatus: 'In Consultation' }), booking('no-show', 'No-Show'), booking('legacy-no-show', 'No Show')];
  const appointments = [...active, ...completed, ...cancelled];
  assert.deepEqual(filterAppointmentQueue(appointments).map(item => item.id), active.map(item => item.id));
  assert.deepEqual(filterAppointmentQueue(appointments, { view: 'completed' }).map(item => item.id), completed.map(item => item.id));
  assert.deepEqual(filterAppointmentQueue(appointments, { view: 'cancelled' }).map(item => item.id), cancelled.map(item => item.id));
  assert.equal(filterAppointmentQueue(appointments, { view: 'all' }).length, appointments.length);
  for (const terminal of completed.concat(cancelled)) assert.notEqual(appointmentGroup(terminal), 'active');
  assert.equal(appointmentStage(completed[1]), 'Completed');
});

test('status changes leave the active queue immediately while archive searches retain notes and visits', () => {
  const original = booking('A1', 'In Consultation', { notes: 'Review laboratory results', patientId: 'P1' });
  const state = { patients: [{ id: 'P1', visits: [{ id: 'V1', summary: 'Keep clinical history' }] }], appointments: [original], schedules: {}, doctors: [] };
  const completed = { ...original, status: 'Completed', visitStatus: 'Completed', lastUpdatedAt: '2026-10-24T02:00:00Z' };
  const saved = applyChanges(state, [{ collection: 'appointments', id: original.id, before: original, after: completed }]);
  assert.equal(filterAppointmentQueue(saved.appointments).length, 0);
  assert.equal(filterAppointmentQueue(saved.appointments, { view: 'completed', search: 'laboratory' })[0].id, original.id);
  assert.equal(filterAppointmentQueue(saved.appointments, { view: 'all', search: 'P1', date: '2050-01-01' }).length, 1);
  assert.equal(filterAppointmentQueue(saved.appointments, { view: 'completed', date: '2050-01-02' }).length, 0);
  assert.equal(filterAppointmentQueue(saved.appointments, { search: 'laboratory' }).length, 0);
  assert.equal(saved.patients[0].visits[0].summary, 'Keep clinical history');
  const cancelled = { ...completed, status: 'Cancelled' };
  assert.equal(filterAppointmentQueue([cancelled]).length, 0);
  assert.equal(filterAppointmentQueue([cancelled], { view: 'cancelled', search: 'laboratory' }).length, 1);
});

test('secretary appointments use the simple booking list and status filter, and patient lists show updates first', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const server = await createServer({ root, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'silent' });
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => null }, location: { search: '' } };
  try {
    const load = async file => (await server.ssrLoadModule(normalizePath(path.join(root, '../pages', file)))).default;
    const render = (Component, props) => renderToString(React.createElement(Component, props));
    const longNote = 'Long booking notes to review in the detailed appointment view. '.repeat(15);
    const appointments = [booking('active', 'Confirmed', { notes: longNote, type: 'Emergency', priority: 'High' }), booking('archive', 'Completed'), booking('cancelled', 'Cancelled'), booking('done', 'Done')];
    const props = { patients: [], appointments, doctors: [], schedules: {} };
    const html = render(await load('medical secretary/MedSecAppointment.jsx'), props);
    assert.match(html, /<div class="medsec-grid">/);
    assert.match(html, /<div class="medsec-list">/);
    assert.match(html, /<button[^>]*class="medsec-list-item /);
    assert.match(html, /<option selected="">All<\/option>/);
    for (const status of ['Confirmed', 'Completed', 'Cancelled', 'No-Show']) assert.ok(html.includes(`<option>${status}</option>`));
    assert.doesNotMatch(html, /medsec-appointment-table|Appointment archive filters/);
    for (const name of ['active Patient', 'archive Patient', 'cancelled Patient', 'done Patient']) assert.ok(html.includes(name), name);
    const patients = [
      { id: 'P-old', name: 'Updated Patient', createdAt: '2026-01-01T00:00:00Z', lastUpdatedAt: '2026-10-24T03:00:00Z', appointments: [] },
      { id: 'P-new', name: 'Recent Patient', createdAt: '2026-10-24T02:00:00Z', appointments: [] },
    ];
    for (const file of ['receptionist/patientsModuleReceptionist.jsx', 'medical secretary/MedSecPatientRecords.jsx']) {
      const patientHtml = render(await load(file), { ...props, patients: [...patients].reverse() });
      assert.ok(patientHtml.indexOf('Updated Patient') < patientHtml.indexOf('Recent Patient'), file);
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    await server.close();
  }
});
