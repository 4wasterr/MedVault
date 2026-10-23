import { clinicToday } from '../../shared/formRules.mjs';
import { dateKey } from '../../pages/medical secretary/medsecData.js';
import { appointmentStage } from '../../shared/appointmentWorkflow.mjs';

export function registrationDate(patient) {
  if (!patient.createdAt) return dateKey(patient.date);
  const created = new Date(patient.createdAt);
  return Number.isFinite(created.getTime()) ? clinicToday(created) : dateKey(patient.date);
}

export function dashboardData(patients = [], appointments = [], today = clinicToday()) {
  const bookings = appointments.filter(item => item.patientId && !['Open', 'Cancelled'].includes(item.status));
  const todaysBookings = bookings.filter(item => dateKey(item.date) === today);
  const newPatients = patients.filter(patient => registrationDate(patient) === today);
  const waiting = new Set(todaysBookings.filter(item => ['Checked-In', 'Waiting'].includes(appointmentStage(item))).map(item => item.patientId));
  const activity = new Map();
  for (const patient of patients) {
    const date = registrationDate(patient);
    if (date) activity.set(`${date}|${patient.id}`, { date, patientId: patient.id });
  }
  for (const booking of bookings) {
    const date = dateKey(booking.date);
    activity.set(`${date}|${booking.patientId}`, { date, patientId: booking.patientId });
  }
  return { waiting: waiting.size, newPatients: newPatients.length, activity: [...activity.values()] };
}
