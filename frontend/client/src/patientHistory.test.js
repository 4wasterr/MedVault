import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPreviousVisit } from '../../shared/patientHistory.mjs';

test('past patient requires visit evidence rather than registration, intake, or medical notes', () => {
  const patient = { id: 'P1', status: 'Waiting', medical: { diagnosis: 'Intake notes' }, recordNotes: [{ text: 'Registration note' }] };
  assert.equal(hasPreviousVisit(patient), false);
  for (const status of ['Confirmed', 'Checked-In', 'Waiting', 'In Consultation', 'Cancelled', 'Open']) {
    assert.equal(hasPreviousVisit(patient, [{ patientId: patient.id, status, date: '2000-01-01' }]), false);
  }
  assert.equal(hasPreviousVisit({ ...patient, visits: [{}] }), false);
  assert.equal(hasPreviousVisit({ ...patient, visits: [{ date: '2099-01-01', doctor: 'Dr. Cruz' }] }), false);
  assert.equal(hasPreviousVisit({ ...patient, visits: [{ date: '2000-01-01', doctor: 'Dr. Cruz', status: 'Cancelled' }] }), false);
});

test('completed bookings and saved visit history count across new bookings and role filtering', () => {
  const patient = { id: 'P1', status: 'Waiting' };
  for (const status of ['Completed', 'Done']) assert.equal(hasPreviousVisit({ ...patient, appointments: [{ status }] }), true);
  assert.equal(hasPreviousVisit(patient, [{ patientId: 'P1', status: 'Completed', visitStatus: 'Waiting' }]), true);
  assert.equal(hasPreviousVisit(patient, [{ patientId: 'Other', status: 'Completed' }]), false);
  assert.equal(hasPreviousVisit(patient, [{ patientId: 'P1', status: 'Cancelled', visitStatus: 'Completed' }]), false);
  assert.equal(hasPreviousVisit({ ...patient, visits: [{ id: 'V1', date: '2000-01-01', doctor: 'Dr. Cruz' }], appointments: [{ status: 'Confirmed' }] }), true);
  assert.equal(hasPreviousVisit({ ...patient, hasPreviousVisit: true, visits: [] }), true);
});
