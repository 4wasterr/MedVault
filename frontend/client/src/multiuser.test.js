import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChanges, changesBetween } from './sharedState.js';

test('multiuser: concurrent non-conflicting edits from two clients merge cleanly', () => {
  const baseline = {
    patients: [
      { id: 'P1', name: 'Maria Santos', phone: '0917-111-1111' },
      { id: 'P2', name: 'Juan Cruz', phone: '0918-222-2222' },
    ],
    appointments: [
      { id: 'A1', patientId: 'P1', doctor: 'Dr. Santos', time: '09:00 AM', status: 'Confirmed' },
    ],
    schedules: {},
    doctors: ['Dr. Santos'],
  };

  // Client A updates patient P1's phone
  const clientAState = {
    ...baseline,
    patients: baseline.patients.map(p => p.id === 'P1' ? { ...p, phone: '0917-999-9999' } : p),
  };
  const changesA = changesBetween(baseline, clientAState);

  // Client B creates a new appointment for patient P2
  const newAppointment = { id: 'A2', patientId: 'P2', doctor: 'Dr. Santos', time: '10:00 AM', status: 'Confirmed' };
  const clientBState = {
    ...baseline,
    appointments: [...baseline.appointments, newAppointment],
  };
  const changesB = changesBetween(baseline, clientBState);

  // Server applies Client A's changes
  let serverState = applyChanges(baseline, changesA);
  assert.equal(serverState.patients.find(p => p.id === 'P1').phone, '0917-999-9999');

  // Server applies Client B's changes
  serverState = applyChanges(serverState, changesB);

  // Both changes are preserved!
  assert.equal(serverState.patients.find(p => p.id === 'P1').phone, '0917-999-9999');
  assert.equal(serverState.appointments.length, 2);
  assert.ok(serverState.appointments.some(a => a.id === 'A2'));
});

test('multiuser: detects concurrent slot booking collision', () => {
  const initial = {
    patients: [{ id: 'P1', name: 'Maria' }, { id: 'P2', name: 'Juan' }],
    appointments: [],
    schedules: {},
    doctors: ['Dr. Reyes'],
  };

  // Both clients see the slot '2026-10-01 09:00 AM with Dr. Reyes' as open
  const slotDate = '2026-10-01';
  const slotTime = '09:00 AM';
  const slotDoctor = 'Dr. Reyes';

  const isSlotAvailable = (appointments, date, time, doctor) => {
    return !appointments.some(a =>
      a.date === date &&
      a.time === time &&
      a.doctor?.toLowerCase() === doctor.toLowerCase() &&
      !['Cancelled', 'Open'].includes(a.status)
    );
  };

  // Initially available
  assert.ok(isSlotAvailable(initial.appointments, slotDate, slotTime, slotDoctor));

  // Client A books the slot first
  const bookingA = { id: 'A1', patientId: 'P1', date: slotDate, time: slotTime, doctor: slotDoctor, status: 'Confirmed' };
  const stateAfterA = applyChanges(initial, [{ collection: 'appointments', id: 'A1', after: bookingA }]);

  // Now slot is no longer available
  assert.equal(isSlotAvailable(stateAfterA.appointments, slotDate, slotTime, slotDoctor), false);

  // Client B attempts to book the same slot -> collision detected!
  const clientBTriesToBook = isSlotAvailable(stateAfterA.appointments, slotDate, slotTime, slotDoctor);
  assert.equal(clientBTriesToBook, false);
});

test('multiuser: incremental sync delta reconciliation', () => {
  const clientLocal = {
    patients: [{ id: 'P1', name: 'Maria Santos', pendingSync: true }],
    appointments: [],
    schedules: {},
    doctors: [],
  };

  // Server sends delta containing newly registered patient and updated doctor schedule
  const serverDelta = [
    { collection: 'patients', id: 'P2', after: { id: 'P2', name: 'Elena Ramos' } },
    { collection: 'schedules', id: 'Dr. Gomez', after: { availableDays: ['Monday', 'Tuesday'] } },
  ];

  const reconciled = applyChanges(clientLocal, serverDelta);

  // Local patient remains
  assert.ok(reconciled.patients.some(p => p.id === 'P1'));
  // Delta patient added
  assert.ok(reconciled.patients.some(p => p.id === 'P2'));
  // Delta schedule applied
  assert.deepEqual(reconciled.schedules['Dr. Gomez'], { availableDays: ['Monday', 'Tuesday'] });
});
