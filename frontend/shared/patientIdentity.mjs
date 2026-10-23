const text = value => value === undefined || value === null ? '' : String(value).trim();

export const normalizePatientName = value => text(value).toLowerCase()
  .replace(/[.,'"`]/g, '').replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();
export const normalizePatientPhone = value => {
  const digits = text(value).replace(/\D/g, '');
  return /^09\d{9}$/.test(digits) ? `63${digits.slice(1)}` : digits;
};

// Keep duplicate detection consistent with the server, including legacy dates.
export function patientBirthdayKey(value) {
  const raw = text(value);
  if (!raw) return '';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const date = new Date(iso ? `${raw}T12:00:00Z` : raw);
  if (Number.isNaN(date.getTime())) return '';
  const key = date.toISOString().slice(0, 10);
  return iso && key !== raw ? '' : key;
}

export function findDuplicatePatient(patient, existingPatients = []) {
  const name = normalizePatientName(patient.name);
  if (!name) return null;
  const phone = normalizePatientPhone(patient.contact);
  const birthday = patientBirthdayKey(patient.birthday);
  return existingPatients.find(existing => {
    if (existing.id === patient.id || normalizePatientName(existing.name) !== name) return false;
    const existingPhone = normalizePatientPhone(existing.contact);
    const existingBirthday = patientBirthdayKey(existing.birthday);
    return Boolean((birthday && existingBirthday && birthday === existingBirthday) ||
      (phone.length >= 7 && existingPhone.length >= 7 && phone === existingPhone));
  }) || null;
}

export function registrationIdentity(form) {
  return {
    name: [form.firstName, form.middleName, form.lastName].map(text).filter(Boolean).join(' '),
    contact: form.contactNumber || '', birthday: form.birthday || '',
  };
}

export const duplicatePatientMessage = patient => `${patient.name} (${patient.id}) already has a patient record with this name and contact number or birthday. Use the existing patient record.`;
