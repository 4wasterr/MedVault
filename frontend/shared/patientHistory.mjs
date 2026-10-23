import { clinicToday } from './formRules.mjs';

const completed = record => record?.status !== 'Cancelled' &&
  [record?.status, record?.visitStatus].some(status => /^(done|completed)$/i.test(status || ''));

export function hasPreviousVisit(patient, appointments = []) {
  if (!patient) return false;
  if (patient.hasPreviousVisit === true) return true;
  const savedVisit = (patient.visits || []).some(visit => {
    if (!visit || ['Cancelled', 'Confirmed', 'Waiting', 'Checked-In', 'In Consultation', 'Open'].includes(visit.status)) return false;
    const date = new Date(visit.date);
    return Boolean(visit.doctor?.trim() && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) <= clinicToday());
  });
  return savedVisit || completed(patient) || (patient.appointments || []).some(completed) ||
    appointments.some(appointment => appointment.patientId === patient.id && completed(appointment));
}
