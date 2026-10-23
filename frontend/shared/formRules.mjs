export const VISIT_TYPES = ['New Consultation', 'Follow-up', 'Routine Checkup', 'Emergency'];
export const ROOMS = ['Room 1', 'Room 2', 'Room 3', 'Room 4', 'Room 5'];
export const normalizeRoom = value => ({ 'General Intake A': 'Room 1', 'Consultation Room 1': 'Room 2', 'Consultation Room 2': 'Room 3' }[value] || (ROOMS.includes(value) ? value : 'Room 1'));
export const SPECIALTIES = ['Cardiologist', 'Gastroenterologist', 'General Health', 'Pulmonology', 'Neurology', 'Gynecology', 'Pediatrics'];
export const normalizeSpecialty = value => ({ 'General Medicine': 'General Health', Cardiology: 'Cardiologist', Gastroenterology: 'Gastroenterologist' }[value] || value || 'General Health');
export const specialtyLabel = value => ({ Cardiologist: 'Cardiology', Gastroenterologist: 'Gastroenterology' }[normalizeSpecialty(value)] || normalizeSpecialty(value));
export const USERNAME_PATTERN = '[A-Za-z][A-Za-z0-9._\\-]{2,31}';
// Allow real names, including accents, apostrophes, initials, and hyphenated names.
export const NAME_PATTERN = "[\\p{L}\\p{M}]+\\.?(?:(?:\\s+|[’'\\-])[\\p{L}\\p{M}]+\\.?)*";
export const personName = (...parts) => parts.map(part => String(part ?? '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ');
export const NAME_GUIDANCE = 'Use letters, spaces, apostrophes, hyphens, or periods for initials; numbers and other symbols are not allowed.';
export const PASSWORD_GUIDANCE = 'Use at least 8 characters with an uppercase letter, a lowercase letter, a number, and a special character.';
export const isPersonName = value => new RegExp(`^(?:${NAME_PATTERN})$`, 'u').test(String(value ?? '').trim());
export function passwordProblem(value) {
  const password = String(value ?? '');
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9\s]/.test(password)) return PASSWORD_GUIDANCE;
  if (new TextEncoder().encode(password).length > 72) return 'Password must be at most 72 UTF-8 bytes.';
  return null;
}
export function nameProblem(value, { optional = false, max = 80, required, maxLength, label = 'Name' } = {}) {
  optional = required === undefined ? optional : !required;
  max = maxLength ?? max;
  if (!String(value ?? '').trim()) return optional ? null : `${label} is required.`;
  if (String(value).trim().length > max) return `Name must be at most ${max} characters.`;
  return isPersonName(value) ? null : NAME_GUIDANCE;
}
export function usernameProblem(value) {
  return new RegExp('^' + USERNAME_PATTERN + '$').test(String(value ?? '')) ? null : 'Start with a letter; use 3-32 letters, numbers, dots, underscores, or hyphens.';
}
export function staffNamesProblem(record) {
  return nameProblem(record.firstName, { label: 'First name' }) || nameProblem(record.middleName, { optional: true, label: 'Middle name' }) || nameProblem(record.lastName, { label: 'Last name' });
}
export function staffProblems(staff, { editing = false, signup = false } = {}) {
  const problems = {};
  if (!new RegExp(`^${USERNAME_PATTERN}$`).test(String(staff.username ?? '').trim())) problems.username = 'Start with a letter; use 3–32 letters, numbers, dots, underscores, or hyphens.';
  if (!editing || staff.password) {
    const problem = passwordProblem(staff.password);
    if (problem) problems.password = problem;
    if (!staff.confirmPassword || staff.password !== staff.confirmPassword) problems.confirmPassword = 'Passwords must match.';
  }
  for (const field of ['firstName', 'middleName', 'lastName']) {
    const problem = nameProblem(staff[field], { optional: field === 'middleName' });
    if (problem) problems[field] = problem;
  }
  if (!String(staff.address ?? '').trim() || staff.address.trim().length > 300) problems.address = 'Enter an address of at most 300 characters.';
  if (!isPHMobile(staff.phone)) problems.phone = 'Use +63 XXX XXX XXXX, for example +63 917 123 4567.';
  if (!isPublicEmail(staff.email)) problems.email = 'Use a supported public email domain, such as gmail.com, yahoo.com, or outlook.com.';
  if (!(signup ? ['Receptionist', 'Medical Secretary'] : ['Receptionist', 'Medical Secretary', 'Super Admin']).includes(staff.role)) problems.role = 'Choose a valid role.';
  return problems;
}
export const RELATIONSHIPS = ['Parent', 'Spouse', 'Sibling', 'Guardian', 'Child', 'Relative', 'Friend', 'Other'];
// Accept existing compact records while all forms and displays use grouped numbers.
export const PHONE_PATTERN = '\\+63(?:9[0-9]{9}| 9[0-9]{2} [0-9]{3} [0-9]{4})';
export function phoneInput(value) {
  const raw = String(value ?? '').replace(/[^+0-9]/g, '');
  if (!raw) return '';
  let digits = raw.replace(/\+/g, '');
  if (digits.startsWith('0')) digits = `63${digits.slice(1)}`;
  else if (digits.startsWith('9')) digits = `63${digits}`;
  if (!digits.startsWith('63')) return raw;
  const mobile = digits.slice(2, 12);
  return ['+63', mobile.slice(0, 3), mobile.slice(3, 6), mobile.slice(6)].filter(Boolean).join(' ');
}
export function formatPhone(value) {
  const raw = String(value ?? '');
  return /^(?:\+?63|0)?9\d{9}$/.test(raw.replace(/\s/g, '')) ? phoneInput(raw) : raw;
}
export const EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'yahoo.com.ph', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'mail.com', 'gmx.com'];
export const EMAIL_PATTERN = `[^\\s@]+@(${EMAIL_DOMAINS.map(domain => [...domain].map(char => char === '.' ? '\\.' : /[a-z]/.test(char) ? `[${char}${char.toUpperCase()}]` : char).join('')).join('|')})`;
export const VITAL_RULES = {
  hr: { label: 'Heart rate (bpm)', min: 30, max: 220, step: 1 },
  temp: { label: 'Temperature (°C)', min: 34, max: 42, step: 0.1 },
  respRate: { label: 'Respiratory rate (breaths/min)', min: 8, max: 60, step: 1 },
  spo2: { label: 'Oxygen saturation (%)', min: 50, max: 100, step: 1 },
  height: { label: 'Height (cm)', min: 30, max: 250, step: 0.1 },
  weight: { label: 'Weight (kg)', min: 1, max: 350, step: 0.1 },
};
export const isPHMobile = value => new RegExp(`^(?:${PHONE_PATTERN})$`).test(String(value ?? ''));
export const isPublicEmail = value => {
  const email = String(value ?? '');
  const [local, domain, extra] = email.split('@');
  return email.length <= 254 && !extra && Boolean(local) && local.length <= 64 &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..') &&
    EMAIL_DOMAINS.includes(domain?.toLowerCase());
};
export function clinicToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function validISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function normalizeVisitType(value) {
  if (VISIT_TYPES.includes(value)) return value;
  if (/follow/i.test(value || '')) return 'Follow-up';
  if (/emergency/i.test(value || '')) return 'Emergency';
  if (/consult|intake/i.test(value || '')) return 'New Consultation';
  return 'Routine Checkup';
}
export function contactProblem(record, { required = true } = {}) {
  if (required && !record.contact) return 'Contact number is required.';
  if (record.contact && !isPHMobile(record.contact)) return 'Contact number must use +63 XXX XXX XXXX (for example, +63 917 123 4567).';
  if (required && !record.emergencyContact) return 'Emergency contact number is required.';
  if (record.emergencyContact && !isPHMobile(record.emergencyContact)) return 'Emergency contact number must use +63 XXX XXX XXXX.';
  if (required && !String(record.emergencyRelationship || '').trim()) return 'Emergency contact relationship is required.';
  if (record.emergencyRelationship && !RELATIONSHIPS.includes(record.emergencyRelationship)) return 'Choose a valid emergency contact relationship.';
  if (record.email && !isPublicEmail(record.email)) return 'Use a supported public email domain, such as gmail.com, yahoo.com, or outlook.com.';
  return null;
}
export function demographicsProblem(record, today = clinicToday()) {
  if (record.age === undefined || record.age === null || String(record.age).trim() === '') return 'Age is required.';
  const age = Number(record.age);
  if (!/^\d+$/.test(String(record.age)) || !Number.isInteger(age) || age > 130) return 'Age must be a whole number from 0 to 130.';
  if (record.birthday && (!validISODate(record.birthday) || record.birthday > today || record.birthday < '1900-01-01')) return 'Birthday must be a valid date from 1900 through today.';
  return contactProblem(record);
}
export function vitalProblem(key, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const value = String(raw);
  if (key === 'bp') {
    const match = value.match(/^(\d{2,3})\/(\d{2,3})$/);
    if (!match) return 'Blood pressure must use systolic/diastolic format, for example 120/80.';
    const [, systolic, diastolic] = match.map(Number);
    return systolic < 70 || systolic > 250 || diastolic < 40 || diastolic > 150 || diastolic >= systolic
      ? 'Blood pressure must be 70–250/40–150 mmHg, with systolic greater than diastolic.' : null;
  }
  const rule = VITAL_RULES[key];
  if (!rule) return null;
  if (!/^\d+(?:\.\d+)?$/.test(value) || Number(value) < rule.min || Number(value) > rule.max ||
    (rule.step === 1 ? !Number.isInteger(Number(value)) : !Number.isInteger(Number((Number(value) * 10).toFixed(6))))) {
    return `${rule.label} must be ${rule.min}–${rule.max}${rule.step === 1 ? ' (whole numbers)' : ' (up to one decimal place)'}.`;
  }
  return null;
}
