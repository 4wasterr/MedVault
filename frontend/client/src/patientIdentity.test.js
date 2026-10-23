import test from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicatePatient, normalizePatientName, normalizePatientPhone, patientBirthdayKey, registrationIdentity } from '../../shared/patientIdentity.mjs';
import { duplicateBookingPatient, selectBookingPatient } from './appointmentBooking.js';
import { emptyRegistrationForm } from './patientRegistration.js';

const patient = { id: 'P1', name: 'Maria D. Cruz-Reyes', contact: '09171234567', birthday: '1991-01-10', age: 35,
  emergencyName: 'Ana Cruz', emergencyContact: '+639181234567', emergencyRelationship: 'Sibling' };

test('duplicate patients match normalized names with either the same phone or birthday', () => {
  assert.equal(normalizePatientName('  MARIA  D. Cruz-Reyes '), 'maria d cruz reyes');
  assert.equal(normalizePatientPhone('0917 123 4567'), '639171234567');
  const candidate = { name: ' Maria D Cruz Reyes ', contact: '+63 917 123 4567' };
  assert.equal(findDuplicatePatient(candidate, [patient]), patient);
  assert.equal(findDuplicatePatient({ name: candidate.name, contact: '+639991234567', birthday: '1991-01-10' }, [patient]), patient);
  assert.equal(findDuplicatePatient({ ...candidate, id: patient.id }, [patient]), null);
  assert.equal(findDuplicatePatient({ name: 'Other Patient', contact: candidate.contact, birthday: patient.birthday }, [patient]), null);
  assert.equal(findDuplicatePatient({ name: candidate.name, contact: '+639991234567' }, [patient]), null);
  assert.equal(findDuplicatePatient({ name: candidate.name, contact: '123456' }, [{ ...patient, contact: '123456', birthday: '' }]), null);
});

test('birthday normalization accepts legacy dates and rejects impossible calendar dates', () => {
  assert.equal(patientBirthdayKey('1991-01-10'), '1991-01-10');
  assert.equal(patientBirthdayKey('1991-01-10T12:00:00Z'), '1991-01-10');
  assert.equal(patientBirthdayKey('2026-02-31'), '');
  assert.equal(patientBirthdayKey('invalid'), '');
  assert.equal(patientBirthdayKey(''), '');
});

test('registration identity detects duplicates before a patient record is built and resets without retaining another identity', () => {
  const form = { ...emptyRegistrationForm(), firstName: 'Maria', middleName: 'D.', lastName: 'Cruz-Reyes', contactNumber: '+63 917 123 4567' };
  assert.equal(findDuplicatePatient(registrationIdentity(form), [patient]), patient);
  assert.equal(findDuplicatePatient(registrationIdentity({ ...form, contactNumber: '', birthday: patient.birthday }), [patient]), patient);
  const cleared = emptyRegistrationForm();
  assert.deepEqual(registrationIdentity(cleared), { name: '', contact: '', birthday: '' });
  assert.equal(findDuplicatePatient(registrationIdentity(cleared), [patient]), null);
});

test('using a duplicate booking selects the existing profile and clears stale identity fields when returning to a new patient', () => {
  const form = { patientId: '', patientName: 'Maria D Cruz Reyes', contact: '+63 917 123 4567', age: 50,
    birthday: '', emergencyName: 'Wrong Person', emergencyContact: '+639991234567', emergencyRelationship: 'Other',
    date: '2050-01-01', time: '09:30', type: 'Follow-up' };
  assert.equal(duplicateBookingPatient(form, [patient]), patient);
  const selected = selectBookingPatient(form, patient);
  assert.equal(duplicateBookingPatient(selected, [patient]), null);
  for (const field of ['age', 'birthday', 'contact', 'emergencyName', 'emergencyContact', 'emergencyRelationship']) assert.equal(selected[field], patient[field]);
  assert.equal(selected.patientId, patient.id);
  const fresh = selectBookingPatient(selected);
  for (const field of ['patientId', 'patientName', 'age', 'birthday', 'contact', 'emergencyName', 'emergencyContact', 'emergencyRelationship']) assert.equal(fresh[field], '');
  assert.equal(duplicateBookingPatient(fresh, [patient]), null);
  assert.equal(fresh.time, form.time);
});
