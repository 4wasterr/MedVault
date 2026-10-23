import { normalizeRoom, ROOMS } from './formRules.mjs';
import { appointmentStage } from './appointmentWorkflow.mjs';

export const CLINIC_OPEN = '08:00';
export const CLINIC_CLOSE = '17:00';
export const LAST_APPOINTMENT = '16:30';
export const APPOINTMENT_MINUTES = 30;
export const CLINIC_HOURS_MESSAGE = 'Choose a time within clinic operating hours (8:00 AM–5:00 PM). The full 30-minute appointment must fit.';

export function timeMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return NaN;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > (match[3] ? 12 : 23) || (match[3] && hour < 1)) return NaN;
  if (match[3]) hour = (hour % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return hour * 60 + minute;
}

export function dateOnly(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

export const withinClinicHours = (start, end) => Number.isFinite(start) && Number.isFinite(end) && start >= 480 && end <= 1020 && start < end;
export const overlaps = (start, end, otherStart, otherEnd) => start < otherEnd && end > otherStart;
const sameDoctor = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
export const isDoctorActive = doctor => Boolean(doctor && (doctor.active === true || doctor.active === 1) && !doctor.archived && !doctor.isArchived && !/^(inactive|deactivated|archived)$/i.test(doctor.status || ''));
export const doctorDisplayName = (name, doctors) => `${name || 'Unassigned'}${doctors.some(doctor => sameDoctor(doctor.name, name) && !isDoctorActive(doctor)) ? ' (Inactive)' : ''}`;
const roomName = room => ROOMS.includes(room) || ['General Intake A', 'Consultation Room 1', 'Consultation Room 2'].includes(room) ? normalizeRoom(room) : String(room || '').trim();

// Open slots reserve the same doctor and room as bookings. Booking a slot replaces
// that record, so excluding its ID releases only its own reservation.
export function appointmentConflict(candidate, appointments = [], schedules = {}, { doctors, excludeId = candidate?.id } = {}) {
  if (!candidate || ['Cancelled', 'No-Show'].includes(appointmentStage(candidate))) return null;
  if (doctors && !doctors.some(doctor => sameDoctor(doctor.name, candidate.doctor) && isDoctorActive(doctor))) return 'Choose an active doctor for this appointment.';
  const start = timeMinutes(candidate.time);
  const end = start + APPOINTMENT_MINUTES;
  if (!withinClinicHours(start, end)) return CLINIC_HOURS_MESSAGE;
  const date = dateOnly(candidate.date);
  const schedule = Object.values(schedules).find(item => sameDoctor(item.doctor, candidate.doctor) && dateOnly(item.date) === date) || schedules[`${candidate.doctor}|${date}`];
  if (schedule) {
    if (start < timeMinutes(schedule.start) || end > timeMinutes(schedule.end)) return 'This time is outside the doctor’s available schedule.';
    if (Object.entries(schedule.blocked || {}).some(([time, reason]) => reason && overlaps(start, end, timeMinutes(time), timeMinutes(time) + APPOINTMENT_MINUTES)) ||
        (schedule.blockedPeriods || []).some(period => overlaps(start, end, timeMinutes(period.start), timeMinutes(period.end)))) return 'The doctor is unavailable during this interval (blocked in Doctor Schedules).';
  }
  const starting = appointmentStage(candidate) === 'In Consultation';
  for (const other of appointments) {
    if (other.id === excludeId || ['Cancelled', 'No-Show'].includes(appointmentStage(other))) continue;
    const ongoing = appointmentStage(other) === 'In Consultation';
    const simultaneous = dateOnly(other.date) === date && overlaps(start, end, timeMinutes(other.time), timeMinutes(other.time) + APPOINTMENT_MINUTES);
    if (!simultaneous && !(starting && ongoing)) continue;
    if (sameDoctor(other.doctor, candidate.doctor)) return ongoing
      ? 'Doctor has an ongoing consultation. Complete it before starting another consultation during this interval.'
      : 'This doctor already has an appointment or reserved slot during this time window.';
    if (candidate.room && other.room && roomName(candidate.room).toLowerCase() === roomName(other.room).toLowerCase()) return ongoing
      ? `${roomName(candidate.room)} has an ongoing consultation. Complete it before starting another consultation.`
      : `${roomName(candidate.room)} is already booked for this time window.`;
  }
  return null;
}
