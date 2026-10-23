import { formatPhone, normalizeSpecialty } from '../../shared/formRules.mjs';
import { findDuplicatePatient } from '../../shared/patientIdentity.mjs';

export const doctorSpecialty = doctor => normalizeSpecialty(doctor?.specialty);
export const appointmentSpecialty = (appointment, doctors) => normalizeSpecialty(appointment?.specialty || doctors.find(doctor => doctor.name === appointment?.doctor)?.specialty);

export function duplicateBookingPatient(form, patients) {
  return form.patientId ? null : findDuplicatePatient({ name: form.patientName, contact: formatPhone(form.contact), birthday: form.birthday }, patients);
}
export const appointmentStatusClass = status => ({ Confirmed: 'confirmed', 'Checked-In': 'checked-in', Waiting: 'waiting', 'In Consultation': 'consultation', Completed: 'completed', Open: 'open', Cancelled: 'cancelled' }[status] || 'pending');

// Copy all booking demographics together so switching patients never keeps another
// patient's contact details and existing records can complete missing intake fields.
export function selectBookingPatient(form, patient) {
  return {
    ...form,
    patientId: patient?.id || '',
    patientName: patient?.name || '',
    age: patient?.age ?? '',
    birthday: patient?.birthday || '',
    contact: patient?.contact || '',
    emergencyName: patient?.emergencyName || '',
    emergencyContact: patient?.emergencyContact || '',
    emergencyRelationship: patient?.emergencyRelationship || '',
  };
}

export function bookingPatient(form, existingPatient, newId, createdAt = new Date().toISOString()) {
  return {
    ...(existingPatient || {
      id: newId, name: form.patientName.trim(), sex: '', birthday: '', address: '',
      status: 'Waiting', createdAt, vitals: {}, medical: {}, appointments: [],
    }),
    age: form.age,
    contact: formatPhone(form.contact),
    emergencyName: form.emergencyName,
    emergencyContact: formatPhone(form.emergencyContact),
    emergencyRelationship: form.emergencyRelationship,
  };
}

export function updatePatientBooking(patients, patient, appointment) {
  const history = {
    sourceAppointmentId: appointment.id, date: appointment.date, doctor: appointment.doctor,
    type: appointment.type, specialty: appointment.specialty, status: 'Scheduled',
  };
  const update = current => ({
    ...current,
    age: patient.age, contact: patient.contact,
    emergencyName: patient.emergencyName, emergencyContact: patient.emergencyContact,
    emergencyRelationship: patient.emergencyRelationship,
    appointments: [history, ...(current.appointments || []).filter(entry =>
      entry.sourceAppointmentId !== appointment.id && entry.id !== appointment.id)],
  });
  return patients.some(current => current.id === patient.id)
    ? patients.map(current => current.id === patient.id ? update(current) : current)
    : [update(patient), ...patients];
}
