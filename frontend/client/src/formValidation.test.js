import test from 'node:test';
import assert from 'node:assert/strict';
import { clinicToday, demographicsProblem, isPHMobile, isPublicEmail, VITAL_RULES, vitalProblem } from '../../shared/formRules.mjs';
import { isBookingUnavailable, patientVisits, timeKey, validateBooking } from '../../pages/medical secretary/medsecData.js';
import { draftKey, readDraft, writeDraft } from './draftStorage.js';

const patient = { age: '0', contact: '+639171234567', emergencyContact: '+639181234567', emergencyRelationship: 'Parent' };

test('required demographics, exact Philippine mobile syntax, and public domains', () => {
  assert.equal(demographicsProblem(patient), null);
  for (const field of ['age', 'contact', 'emergencyContact', 'emergencyRelationship']) assert.ok(demographicsProblem({ ...patient, [field]: '' }));
  for (const phone of ['09171234567', '+63 9171234567', '+638171234567', '+63917123456', '+6391712345678']) assert.equal(isPHMobile(phone), false, phone);
  assert.equal(isPHMobile(patient.contact), true);
  for (const email of ['user@gmail.com', 'person+tag@outlook.com', 'person@YAHOO.COM']) assert.equal(isPublicEmail(email), true, email);
  for (const email of ['user@gmail.com.evil.test', 'user@clinic.test', 'user@@gmail.com', '.user@gmail.com', 'user..name@gmail.com', 'user@gnail.com']) assert.equal(isPublicEmail(email), false, email);
});

test('calendar boundaries use Manila and accept birthdays on the current day', () => {
  assert.equal(clinicToday(new Date('2026-10-22T16:01:00Z')), '2026-10-23');
  assert.equal(demographicsProblem({ ...patient, birthday: '2026-10-23' }, '2026-10-23'), null);
  for (const birthday of ['2026-10-24', '2026-02-30', '1899-12-31']) assert.ok(demographicsProblem({ ...patient, birthday }, '2026-10-23'));
  const booking = { patientId: 'P1', doctor: 'Dr. Cruz', date: '2050-01-01', time: '09:17', type: 'Follow-up' };
  assert.equal(validateBooking(booking), null);
  assert.ok(validateBooking({ ...booking, date: '2020-01-01' }));
  for (const time of ['24:00', '09:60', '00:30 AM']) assert.equal(timeKey(time), '');
});

test('all vital boundaries and numeric masks enforce the requested ranges', () => {
  for (const [key, rule] of Object.entries(VITAL_RULES)) {
    for (const value of [rule.min, rule.max, '']) assert.equal(vitalProblem(key, value), null, `${key}: ${value}`);
    for (const value of [rule.min - 1, rule.max + 1, 'abc', '1e2', '-1']) assert.ok(vitalProblem(key, value), `${key}: ${value}`);
  }
  for (const value of ['70/40', '250/150', '120/80']) assert.equal(vitalProblem('bp', value), null);
  for (const value of ['69/40', '251/80', '120/39', '200/151', '80/120', '120-80']) assert.ok(vitalProblem('bp', value));
  assert.ok(vitalProblem('hr', '60.5'));
  assert.ok(vitalProblem('temp', '36.66'));
});

test('any minute is bookable while complete 30-minute overlaps remain protected', () => {
  const key = 'Dr. Cruz|2050-01-01';
  const schedules = { [key]: { start: '08:07', end: '17:13', blocked: { '12:00': 'Lunch' }, blockedPeriods: [{ start: '14:07', end: '14:16' }] } };
  const busy = time => isBookingUnavailable(schedules, [], 'Dr. Cruz', '2050-01-01', time);
  assert.equal(busy('09:17'), false);
  assert.equal(busy('08:06'), true);
  assert.equal(busy('16:30'), false);
  assert.equal(busy('16:31'), true);
  assert.equal(busy('11:45'), true);
  assert.equal(busy('12:30'), false);
  assert.equal(busy('13:45'), true);
  assert.equal(busy('14:16'), false);
  const appointments = [{ id: 'A1', doctor: 'Dr. Cruz', date: '2050-01-01', time: '09:17', status: 'Confirmed' }];
  assert.equal(isBookingUnavailable(schedules, appointments, 'Dr. Cruz', '2050-01-01', '09:46'), true);
  assert.equal(isBookingUnavailable(schedules, appointments, 'Dr. Cruz', '2050-01-01', '09:47'), false);
});

test('visit deduplication merges legacy copies and retains distinct appointments and details', () => {
  const visit = { id: 'visit-APPT-1', appointmentId: 'APPT-1', date: '2026-10-01', doctor: 'Dr. Cruz', type: 'Follow-up', diagnosis: 'Saved detail' };
  const legacy = { id: 'legacy-P1-0', date: 'Oct 1, 2026', doctor: 'Dr. Cruz', type: 'Follow-up', notes: 'Legacy note' };
  const visits = patientVisits({ visits: [legacy, visit, { ...visit }, { ...visit, id: 'visit-APPT-2', appointmentId: 'APPT-2' }] });
  assert.equal(visits.length, 2);
  assert.equal(visits[0].diagnosis, 'Saved detail');
  assert.equal(visits[0].notes, 'Legacy note');
  assert.equal(patientVisits({ id: 'P1', appointments: [{ sourceAppointmentId: 'A1', status: 'Done' }, { sourceAppointmentId: 'A1', status: 'Done' }] }).length, 1);
  const fromServer = patientVisits({ id: 'P1', appointments: [{ id: 'APPT-1', status: 'Completed', date: '2026-10-01', doctor: 'Dr. Cruz', type: 'Follow-up' }] });
  assert.equal(fromServer[0].appointmentId, 'APPT-1');
  assert.equal(patientVisits({ visits: [visit, ...fromServer] }).length, 1);
});

test('drafts round-trip every field, separate accounts, recover corrupt storage, and omit credentials', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const key = draftKey('Receptionist:alice', 'registration');
  const draft = { ...patient, name: 'Draft Patient', birthday: '1990-01-01', notes: 'Unfinished note', visits: [{ date: '2026-10-01', summary: 'Draft visit' }], password: 'never-store', confirmPassword: 'never-store' };
  assert.equal(writeDraft(storage, key, draft), true);
  const { password, confirmPassword, ...safe } = draft;
  assert.deepEqual(readDraft(storage, key, {}), safe);
  assert.equal(values.get(key).includes(password), false);
  assert.equal(values.get(key).includes(confirmPassword), false);
  assert.deepEqual(readDraft(storage, draftKey('Receptionist:bob', 'registration'), {}), {});
  values.set(key, '{invalid');
  assert.deepEqual(readDraft(storage, key, {}), {});
  assert.equal(writeDraft({ setItem() { throw new Error('Quota exceeded'); } }, key, draft), false);
});
