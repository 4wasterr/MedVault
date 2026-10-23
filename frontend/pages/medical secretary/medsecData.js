import { clinicToday, contactProblem, demographicsProblem, normalizeVisitType, validISODate, vitalProblem, VISIT_TYPES, nameProblem, staffProblems, SPECIALTIES } from '../../shared/formRules.mjs';
import { hasPreviousVisit } from '../../shared/patientHistory.mjs';
import { appointmentStage } from '../../shared/appointmentWorkflow.mjs';
import { timeMinutes, withinClinicHours, appointmentConflict, CLINIC_HOURS_MESSAGE } from '../../shared/schedulingRules.mjs';
export { timeMinutes } from '../../shared/schedulingRules.mjs';
export const DOCTORS = [];

export function createRecordId(prefix) {
  const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${unique}`;
}

export function isPastPatient(patient, appointments = []) {
  return hasPreviousVisit(patient, appointments);
}

export const todayISO = clinicToday;

export function dateKey(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function validCalendarDate(value) {
  const key = dateKey(value);
  if (!key) return '';
  return validISODate(key) ? key : '';
}

export function displayDate(value) {
  const key = dateKey(value);
  if (!key) return value || 'No date';
  return new Date(`${key}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
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
  const first = Math.max(480, timeMinutes(start));
  const last = Math.min(1020, timeMinutes(end));
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
    doctor, date: dateKey(date), start: '08:00', end: '17:00', blocked: {},
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
    !['Cancelled', 'No-Show'].includes(appointmentStage(appointment))
  );
}

export function availableSlots(schedules, appointments, doctor, date, excludeId, room) {
  const schedule = getSchedule(schedules, doctor, date);
  return slotsBetween(schedule.start, schedule.end).filter((time) =>
    !isBookingUnavailable(schedules, appointments, doctor, date, time, excludeId, room)
  );
}

export function visitStatus(appointment) {
  const status = appointmentStage(appointment);
  if (['Waiting', 'In Consultation', 'Completed'].includes(status)) return status;
  return 'Waiting';
}

//additional codes


export function validatePatientEdit(patient) {
  const problem = nameProblem(patient?.name, { max: 160 }) || nameProblem(patient?.emergencyName, { max: 160, optional: true });
  if (problem) return problem;
  return demographicsProblem({ ...patient, birthday: dateKey(patient.birthday) });
}
export function validateRegisterForm(form) {
  for (const key of ['firstName', 'middleName', 'lastName', 'emergFirstName', 'emergMiddleName', 'emergLastName']) {
    const problem = nameProblem(form?.[key], { optional: !['firstName', 'lastName'].includes(key) });
    if (problem) return problem;
  }
  return demographicsProblem({ ...form, contact: form.contactNumber, emergencyContact: form.emergContactNumber });
}
export function validateBooking(form, { checkDate = true } = {}) {
  if (!form?.patientId && !form?.patientName?.trim()) return 'Choose a patient or enter the patient name.';
  if (form.patientName && nameProblem(form.patientName, { max: 160 })) return nameProblem(form.patientName, { max: 160 });
  if (!form.doctor?.trim()) return 'Choose an active doctor.';
  const bookingDate = validCalendarDate(form.date);
  if (!bookingDate || !timeKey(form.time)) return 'Please select a valid date and time.';
  if (!withinClinicHours(timeMinutes(form.time), timeMinutes(form.time) + 30)) return CLINIC_HOURS_MESSAGE;
  if (checkDate && bookingDate < todayISO()) return 'Appointments cannot be booked or rescheduled in the past.';
  if (!VISIT_TYPES.includes(form.type)) return 'Choose a standard visit type.';
  return form.contact !== undefined ? contactProblem(form, { required: false }) : null;
}
export const validateContactDetails = contactProblem;
export function validatePatientRecord(record) {
  const problem = validatePatientEdit(record);
  if (problem) return problem;
  for (const [key, value] of Object.entries(record.vitals || {})) {
    const issue = vitalProblem(key, value);
    if (issue) return issue;
  }
  if (record.vitals?.measuredAt && (!Number.isFinite(new Date(record.vitals.measuredAt).getTime()) || new Date(record.vitals.measuredAt).getTime() > Date.now() + 300000)) return 'Vitals measured at must be a valid time and cannot be in the future.';
  for (const visit of record.visits || []) {
    if (!validISODate(visit.date) || !visit.doctor?.trim()) return 'Each visit needs a valid date and doctor.';
    if (!VISIT_TYPES.includes(visit.type)) return 'Choose a standard visit type for every visit.';
  }
  return null;
}
export function validateStaffForm(staff, options) {
  return Object.values(staffProblems(staff, options))[0] || null;
}
export function validateDoctorForm(doctor) {
  const problem = nameProblem(doctor?.name, { max: 100 });
  if (problem) return problem;
  if (!SPECIALTIES.includes(doctor.specialty)) return 'Choose a standard specialty.';
  return contactProblem({ contact: doctor.phone, email: doctor.email }, { required: false });
}
export function isBookingUnavailable(schedules, appointments, doctor, date, time, excludeId, room) {
  return Boolean(appointmentConflict({ id: excludeId, doctor, date, time, room }, appointments, schedules));
}

// Keep distinct appointments even when a patient sees the same doctor twice that day.
export function patientVisits(patient) {
  const visits = patient.visits ?? (patient.appointments || [])
    .filter(item => /^(done|completed)$/i.test(item.status || item.visitStatus || ''))
    .map((item, index) => {
      const appointmentId = item.sourceAppointmentId || item.appointmentId || item.id;
      return { id: appointmentId ? 'visit-' + appointmentId : 'legacy-' + patient.id + '-' + index,
        appointmentId, date: item.date || '', doctor: item.doctor || '', type: item.type || '', summary: '', notes: '' };
    });
  const result = [];
  const source = visit => visit.appointmentId || visit.sourceAppointmentId || (visit.id?.startsWith('visit-APPT') ? visit.id.slice(6) : '');
  const legacy = visit => !source(visit) && (!visit.id || visit.id.startsWith('legacy-'));
  const fingerprint = visit => dateKey(visit.date) + '|' + String(visit.doctor || '').trim().toLowerCase() + '|' + normalizeVisitType(visit.type);
  for (const visit of visits) {
    const index = result.findIndex(item => (visit.id && item.id === visit.id) || (source(visit) && source(item) === source(visit)) ||
      ((legacy(visit) || legacy(item)) && fingerprint(item) === fingerprint(visit)));
    const normalized = { ...visit, date: dateKey(visit.date), type: normalizeVisitType(visit.type) };
    if (index < 0) result.push(normalized);
    else {
      const preferred = source(visit) && !source(result[index]) ? normalized : result[index];
      const other = preferred === normalized ? result[index] : normalized;
      result[index] = { ...other, ...Object.fromEntries(Object.entries(preferred).filter(([, value]) => value !== '' && value !== undefined)) };
    }
  }
  return result;
}
