export const DOCTORS = ['Dr. Cruz', 'Dr. Santos', 'Dr. Reyes', 'Dr. Rebuyaco'];

export function createRecordId(prefix) {
  const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${unique}`;
}

export function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function dateKey(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

export function displayDate(value) {
  const key = dateKey(value);
  if (!key) return value || 'No date';
  return new Date(`${key}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function timeMinutes(value) {
  if (!value) return NaN;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return NaN;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > (match[3] ? 12 : 23)) return NaN;
  if (match[3]) hour = (hour % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return hour * 60 + minute;
}

export function timeKey(value) {
  const minutes = timeMinutes(value);
  if (!Number.isFinite(minutes)) return '';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function displayTime(value) {
  const minutes = timeMinutes(value);
  if (!Number.isFinite(minutes)) return value || '';
  const hour = Math.floor(minutes / 60);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function slotsBetween(start, end) {
  const first = timeMinutes(start);
  const last = timeMinutes(end);
  if (!Number.isFinite(first) || !Number.isFinite(last) || first >= last) return [];
  const slots = [];
  for (let minute = first; minute + 30 <= last; minute += 30) {
    slots.push(timeKey(`${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`));
  }
  return slots;
}

export function scheduleKey(doctor, date) {
  return `${doctor}|${dateKey(date)}`;
}

export function getSchedule(schedules, doctor, date) {
  return schedules[scheduleKey(doctor, date)] || {
    doctor, date: dateKey(date), start: '09:00', end: '17:00', blocked: {},
  };
}

export function hasBooking(appointments, doctor, date, time, excludeId) {
  const targetMinute = timeMinutes(time);
  if (!Number.isFinite(targetMinute)) return false;
  return appointments.some((appointment) =>
    appointment.id !== excludeId &&
    appointment.doctor === doctor &&
    dateKey(appointment.date) === dateKey(date) &&
    Math.abs(timeMinutes(appointment.time) - targetMinute) < 30 &&
    !['Open', 'Cancelled'].includes(appointment.status)
  );
}

export function availableSlots(schedules, appointments, doctor, date, excludeId) {
  const schedule = getSchedule(schedules, doctor, date);
  return slotsBetween(schedule.start, schedule.end).filter((time) =>
    !schedule.blocked?.[time] && !hasBooking(appointments, doctor, date, time, excludeId)
  );
}

export function visitStatus(appointment) {
  if (['Waiting', 'In Consultation', 'Completed'].includes(appointment.visitStatus)) return appointment.visitStatus;
  if (['Waiting', 'In Consultation', 'Completed'].includes(appointment.status)) return appointment.status;
  return 'Waiting';
}
