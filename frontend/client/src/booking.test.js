import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransitionAppointment, canUndoCheckIn, appointmentStage } from '../../shared/appointmentWorkflow.mjs';


test('booking: 30-minute slot increments and time parsing', () => {
  const parseMinutes = (timeStr) => {
    const match = String(timeStr || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) return NaN;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    if (minute > 59 || hour > (match[3] ? 12 : 23) || (match[3] && hour < 1)) return NaN;
    if (match[3]) hour = (hour % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
    return hour * 60 + minute;
  };

  assert.equal(parseMinutes('08:00 AM'), 480);
  assert.equal(parseMinutes('08:30 AM'), 510);
  assert.equal(parseMinutes('12:00 PM'), 720);
  assert.equal(parseMinutes('05:00 PM'), 1020);
  assert.ok(Number.isNaN(parseMinutes('invalid')));
  assert.ok(Number.isNaN(parseMinutes('13:00 PM')));

  // Check 30-minute interval alignment
  assert.equal(parseMinutes('08:00 AM') % 30, 0);
  assert.equal(parseMinutes('08:30 AM') % 30, 0);
  assert.notEqual(parseMinutes('08:15 AM') % 30, 0);
});

test('booking: status lifecycle transitions', () => {
  const canTransition = (from, to) => canTransitionAppointment({ status: from }, { status: to });

  assert.ok(canTransition('Open', 'Confirmed'));
  assert.ok(canTransition('Confirmed', 'Checked-In'));
  assert.equal(canTransition('Confirmed', 'Completed'), false);
  assert.equal(canTransition('Confirmed', 'In Consultation'), false);
  assert.ok(canTransition('Checked-In', 'Confirmed'));
  assert.ok(canTransition('Checked-In', 'In Consultation'));
  assert.ok(canTransition('In Consultation', 'Completed'));
  assert.ok(canTransition('Confirmed', 'Cancelled'));

  // Regression / invalid transitions
  assert.equal(canTransition('Completed', 'Confirmed'), false);
  assert.equal(canTransition('Completed', 'Open'), false);
  assert.equal(canTransition('Cancelled', 'Confirmed'), false);
  assert.equal(canTransition('Cancelled', 'Open'), false);
  assert.equal(appointmentStage({ status: 'Confirmed', visitStatus: 'Waiting' }), 'Confirmed');
  assert.equal(canUndoCheckIn({ status: 'Checked-In', visitStatus: 'Waiting' }), true);
  assert.equal(canUndoCheckIn({ status: 'Checked-In', visitStatus: 'In Consultation' }), false);
  assert.equal(canTransitionAppointment({ status: 'Checked-In', visitStatus: 'In Consultation' }, { status: 'Confirmed' }), false);
});

test('booking: conflict detection between simultaneous appointments', () => {
  const hasConflict = (appointments, newAppt) => {
    const active = appointments.filter(a => a.id !== newAppt.id && !['Open', 'Cancelled'].includes(a.status));
    return active.some(a =>
      a.doctor?.toLowerCase() === newAppt.doctor?.toLowerCase() &&
      a.date === newAppt.date &&
      a.time === newAppt.time
    );
  };

  const existing = [
    { id: 'A1', doctor: 'Dr. Cruz', date: '2026-10-01', time: '09:00 AM', status: 'Confirmed' },
    { id: 'A2', doctor: 'Dr. Cruz', date: '2026-10-01', time: '10:00 AM', status: 'Confirmed' },
  ];

  // Same doctor, date, time -> conflict!
  assert.ok(hasConflict(existing, { id: 'A3', doctor: 'Dr. Cruz', date: '2026-10-01', time: '09:00 AM', status: 'Confirmed' }));
  // Different time -> no conflict
  assert.equal(hasConflict(existing, { id: 'A3', doctor: 'Dr. Cruz', date: '2026-10-01', time: '09:30 AM', status: 'Confirmed' }), false);
  // Different doctor -> no conflict
  assert.equal(hasConflict(existing, { id: 'A3', doctor: 'Dr. Santos', date: '2026-10-01', time: '09:00 AM', status: 'Confirmed' }), false);
  // Cancelled appointment doesn't block slot
  const withCancelled = [
    { id: 'A1', doctor: 'Dr. Cruz', date: '2026-10-01', time: '09:00 AM', status: 'Cancelled' },
  ];
  assert.equal(hasConflict(withCancelled, { id: 'A3', doctor: 'Dr. Cruz', date: '2026-10-01', time: '09:00 AM', status: 'Confirmed' }), false);
});
