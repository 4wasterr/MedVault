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

function validCalendarDate(value) {
  const key = dateKey(value);
  if (!key) return '';
  const parsed = new Date(`${key}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === key ? key : '';
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

//additional codes


export function validatePatientEdit(patient) {
  if (!patient) return 'Patient data is missing.';
  if (!patient.name?.trim()) return 'Patient name is required.';
  if (patient.age !== '' && patient.age !== undefined) {
    const age = Number(patient.age);
    if (!Number.isInteger(age) || age < 0 || age > 130) return 'Age must be a whole number from 0 to 130.';
  }
  if (patient.birthday) {
    const birthdayKey = validCalendarDate(patient.birthday);
    if (!birthdayKey) return 'Birthday is not a valid date.';
    const birthday = new Date(`${birthdayKey}T12:00:00`);
    if (birthday.getTime() > Date.now()) return 'Birthday cannot be in the future.';
    if (birthday.getFullYear() < 1900) return 'Birthday cannot be before 1900.';
  }
  if (patient.sex && !['Female', 'Male', 'Other'].includes(patient.sex)) return 'Choose a valid sex value.';
  return validateContactDetails(patient);
}
export function validateRegisterForm(formData) {
  if (!formData) return "Registration data is missing.";
  if (!formData.firstName?.trim() || !formData.lastName?.trim()) {
    return "First and last names are required.";
  }
  return null;
}
export function validateBooking(form, { checkDate = false } = {}) {
  if (!form) return 'Booking data is missing.';
  if (!form.patientId && !form.patientName?.trim()) return 'Choose a patient or enter the patient name.';
  if (!form.doctor?.trim()) return 'Choose an active doctor.';
  const bookingDate = validCalendarDate(form.date);
  if (!bookingDate || !timeKey(form.time)) return 'Please select a valid date and time slot.';
  if (checkDate && bookingDate < todayISO()) return 'Appointments cannot be created in the past.';
  return null;
}
export function validateContactDetails(contact) {
  if (!contact) return 'Contact details are missing.';
  const phone = (value) => {
    const compact = String(value).trim().replace(/[\s()-]/g, '');
    const local = compact.startsWith('+63') ? `0${compact.slice(3)}` : compact;
    return /^09\d{9}$/.test(local);
  };
  if (contact.contact && !phone(contact.contact)) return 'Contact number must be a valid Philippine mobile number.';
  if (contact.emergencyContact && !phone(contact.emergencyContact)) return 'Emergency contact must be a valid Philippine mobile number.';
  return null;
}
export function validatePatientRecord(record) {
  if (!record) return "Patient record data is missing.";
  return null;
}
export function validateStaffForm(staff) {
  if (!staff) return "Staff data is missing.";
  if (!staff.name?.trim() && !staff.firstName?.trim()) {
    return "Staff name is required.";
  }
  return null;
}
export function validateDoctorForm(doctor) {
  if (!doctor) return "Doctor data is missing.";
  if (!doctor.name?.trim() && !doctor.firstName?.trim()) {
    return "Doctor name is required.";
  }
  return null;
}
