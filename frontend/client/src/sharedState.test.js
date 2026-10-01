import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChanges, changesBetween, emptyState } from './sharedState.js';

test('related patient and booking edits stay in one change set', () => {
  const previous = emptyState();
  const patient = { id: 'PTNT-1', name: 'Patient' };
  const appointment = { id: 'APPT-1', patientId: patient.id, status: 'Confirmed' };
  const next = { patients: [patient], appointments: [appointment], schedules: {}, doctors: [] };
  const changes = changesBetween(previous, next);
  assert.equal(changes.length, 2);
  assert.deepEqual(applyChanges(previous, changes), next);
});

test('a later local edit can be replayed over a server response', () => {
  const patient = { id: 'PTNT-1', name: 'Patient' };
  const server = { patients: [patient], appointments: [], schedules: {}, doctors: [] };
  const local = { ...server, schedules: { 'Dr. Cruz|2026-10-01': { start: '09:00', end: '17:00' } } };
  assert.deepEqual(applyChanges(server, changesBetween(server, local)), local);
});
