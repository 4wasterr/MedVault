import test from 'node:test';
import assert from 'node:assert/strict';
import { ageFromBirthday, ageProblem, withBirthday } from '../../shared/formRules.mjs';
import { appointmentConflict, isDoctorActive } from '../../shared/schedulingRules.mjs';
import { isPatientArchived, setPatientArchived } from '../../shared/patientArchive.mjs';
import { applyChanges, changesBetween } from './sharedState.js';
import { availableSlots } from '../../pages/medical secretary/medsecData.js';

const booking = { id: 'A1', doctor: 'Dr. Cruz', date: '2050-01-01', time: '09:00', room: 'Room 2', status: 'Confirmed' };

test('DOB derives full years at birthday boundaries, including leap years, and rejects contradictory ages', () => {
  assert.equal(ageFromBirthday('2000-10-24', '2026-10-23'), 25);
  assert.equal(ageFromBirthday('2000-10-24', '2026-10-24'), 26);
  assert.equal(ageFromBirthday('2000-02-29', '2025-02-28'), 24);
  assert.equal(ageFromBirthday('2000-02-29', '2025-03-01'), 25);
  assert.equal(ageFromBirthday('2026-02-30'), null);
  assert.deepEqual(withBirthday({ age: 45 }, '2000-10-24', '2026-10-24'), { age: 26, birthday: '2000-10-24' });
  for (const record of [{ age: -1 }, { age: 131 }, { age: 1.5 }, { age: 35, birthday: '1990-01-01' }, { age: 0, birthday: '2026-10-25' }, { age: 126, birthday: '1890-01-01' }]) {
    assert.ok(ageProblem(record, '2026-10-24'));
  }
  assert.equal(ageProblem({ age: 0, birthday: '2026-10-24' }, '2026-10-24'), null);
});

test('full appointments and reservations stay inside clinic hours even if legacy availability is wider', () => {
  const schedules = { 'Dr. Cruz|2050-01-01': { start: '06:00', end: '20:00' } };
  for (const time of ['07:59', '16:31', '17:00', '23:30', 'invalid']) assert.match(appointmentConflict({ ...booking, time }, [], schedules), /clinic operating hours/);
  for (const time of ['08:00', '09:17', '16:30']) assert.equal(appointmentConflict({ ...booking, time }, [], schedules), null);
  const slots = availableSlots(schedules, [], booking.doctor, booking.date);
  assert.equal(slots[0], '08:00');
  assert.equal(slots.at(-1), '16:30');
});

test('doctor and room overlaps include partial intervals and open reservations but allow touching endpoints', () => {
  assert.match(appointmentConflict({ ...booking, id: 'A2', time: '09:29', room: 'Room 3' }, [booking]), /doctor already has/);
  assert.match(appointmentConflict({ ...booking, id: 'A2', time: '08:31', doctor: 'Dr. Reyes' }, [booking]), /Room 2 is already booked/);
  for (const time of ['08:30', '09:30']) assert.equal(appointmentConflict({ ...booking, id: 'A2', time }, [booking]), null);
  assert.equal(appointmentConflict(booking, [booking]), null);
  assert.equal(appointmentConflict({ ...booking, id: 'A2' }, [{ ...booking, status: 'Cancelled' }]), null);
  assert.match(appointmentConflict({ ...booking, id: 'A2' }, [{ ...booking, status: 'Open' }]), /reserved slot/);
  assert.equal(appointmentConflict({ ...booking, id: 'A2', doctor: 'Dr. Reyes', room: 'Room 103' }, [{ ...booking, room: 'Room 102' }]), null);
});

test('ongoing consultations cannot run concurrently even when their booked times differ', () => {
  const ongoing = { ...booking, status: 'In Consultation' };
  assert.match(appointmentConflict({ ...booking, id: 'A2', time: '11:00', status: 'In Consultation' }, [ongoing]), /Doctor has an ongoing consultation/);
  assert.match(appointmentConflict({ ...booking, id: 'A2', doctor: 'Dr. Reyes', time: '11:00', status: 'In Consultation' }, [ongoing]), /Room 2 has an ongoing consultation/);
  assert.equal(appointmentConflict({ ...booking, id: 'A2', time: '11:00' }, [ongoing]), null);
  assert.equal(appointmentConflict({ ...booking, id: 'A2', time: '11:00', status: 'In Consultation' }, [{ ...ongoing, status: 'Completed' }]), null);
  assert.match(appointmentConflict(booking, [], {}, { doctors: [{ name: booking.doctor, active: false }] }), /active doctor/);
  for (const doctor of [{ active: false }, { active: 0 }, { active: true, status: 'Deactivated' }, { active: true, archived: true }]) assert.equal(isDoctorActive(doctor), false);
});

test('restored patients survive shared-state round trips without dropping history or clinical data', () => {
  const patient = { id: 'P1', name: 'Patient', archived: true, isArchived: true, medical: { diagnosis: 'Keep' }, visits: [{ id: 'V1' }] };
  const state = { patients: [patient], appointments: [], schedules: {}, doctors: [] };
  const restored = setPatientArchived(patient, false);
  const roundTrip = applyChanges(state, JSON.parse(JSON.stringify(changesBetween(state, { ...state, patients: [restored] }))));
  assert.equal(isPatientArchived(roundTrip.patients[0]), false);
  assert.deepEqual(roundTrip.patients[0].medical, patient.medical);
  assert.deepEqual(roundTrip.patients[0].visits, patient.visits);
  assert.equal(isPatientArchived({}), false);
});
