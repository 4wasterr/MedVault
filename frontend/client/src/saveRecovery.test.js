import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from './sharedState.js';
import { recoverRejectedSave } from './saveRecovery.js';

const patient = { id: 'P1', name: 'Maria Cruz', contact: '+63 917 123 4567' };
const baseState = () => ({ ...emptyState(), patients: [patient] });

test('a correction made while a rejected save is in flight remains eligible for automatic saving', () => {
  const base = baseState();
  const submitted = { ...base, patients: [{ ...patient, contact: '+63 917' }] };
  const corrected = { ...base, patients: [{ ...patient, contact: '+63 918 123 4567' }] };
  const recovery = recoverRejectedSave(base, submitted, corrected);
  assert.equal(recovery.hasNewerEdits, true);
  assert.equal(recovery.state, corrected);
  // If that correction is also rejected without another edit, it must stop.
  assert.equal(recoverRejectedSave(base, corrected, corrected).hasNewerEdits, false);
});

test('conflict rebasing preserves pending patient and booking changes without treating server updates as new user edits', () => {
  const base = baseState();
  const submitted = { ...base, patients: [{ ...patient, address: 'Local address' }],
    appointments: [{ id: 'A1', patientId: patient.id, type: 'Follow-up' }] };
  const server = { ...base, patients: [patient, { id: 'P2', name: 'Server Patient' }] };
  const recovery = recoverRejectedSave(base, submitted, submitted, server);
  assert.equal(recovery.hasNewerEdits, false);
  assert.equal(recovery.state.patients.find(item => item.id === 'P1').address, 'Local address');
  assert.equal(recovery.state.patients.find(item => item.id === 'P2').name, 'Server Patient');
  assert.deepEqual(recovery.state.appointments, submitted.appointments);

  const corrected = { ...submitted, appointments: [{ ...submitted.appointments[0], type: 'New Consultation' }] };
  const correction = recoverRejectedSave(base, submitted, corrected, server);
  assert.equal(correction.hasNewerEdits, true);
  assert.equal(correction.state.appointments[0].type, 'New Consultation');
});
