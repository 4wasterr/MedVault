import { clinicToday, contactProblem, demographicsProblem, normalizeVisitType, validISODate, vitalProblem, VISIT_TYPES, nameProblem, staffProblems, SPECIALTIES } from '../../shared/formRules.mjs';
export const DOCTORS = [];

export function createRecordId(prefix) {
  const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${unique}`;
}

export function isPastPatient(patient, appointments = []) {
  if (!patient) return false;
  const completed = (record) => record?.status !== 'Cancelled' &&
    /^(done|completed)$/i.test(record?.visitStatus || record?.status || '');
  const savedDetails = [
    patient.medicalHistory?.conditions ?? patient.medical?.history,
    patient.medicalHistory?.allergies ?? patient.medical?.allergies,
    patient.medicalHistory?.medications ?? patient.medical?.medications,
    patient.consultation?.diagnosis ?? patient.medical?.diagnosis,
    patient.consultation?.treatment ?? patient.medical?.treatment,
    patient.consultation?.followUp ?? patient.medical?.notes,
    patient.consultation?.findings,
    ...(patient.recordNotes || []).map((note) => note.text),
  ];
  return savedDetails.some((value) => String(value ?? '').trim().length > 0) ||
    (patient.visits || []).length > 0 || completed(patient) ||
    (patient.appointments || []).some(completed) ||
    appointments.some((appointment) => appointment.patientId === patient.id && completed(appointment));
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

export function timeMinutes(value) {
  if (!value) return NaN;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return NaN;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > (match[3] ? 12 : 23) || (match[3] && hour < 1)) return NaN;
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
export function isBookingUnavailable(schedules, appointments, doctor, date, time, excludeId) {
  const minute = timeMinutes(time);
  const schedule = getSchedule(schedules, doctor, date);
  if (!Number.isFinite(minute) || minute < timeMinutes(schedule.start) || minute + 30 > timeMinutes(schedule.end)) return true;
  if (hasBooking(appointments, doctor, date, time, excludeId)) return true;
  const overlaps = (start, end) => minute < end && minute + 30 > start;
  return Object.keys(schedule.blocked || {}).some(slot => schedule.blocked[slot] && overlaps(timeMinutes(slot), timeMinutes(slot) + 30)) ||
    (schedule.blockedPeriods || []).some(period => overlaps(timeMinutes(period.start), timeMinutes(period.end)));
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
