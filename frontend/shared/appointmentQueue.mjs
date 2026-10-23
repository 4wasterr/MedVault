import { appointmentStage } from './appointmentWorkflow.mjs';
import { compareRecordsNewestFirst } from './recordOrdering.mjs';
import { dateOnly } from './schedulingRules.mjs';
import { specialtyLabel, normalizeVisitType } from './formRules.mjs';

export const APPOINTMENT_VIEWS = [
  { id: 'active', label: 'Upcoming / In-Progress' },
  { id: 'completed', label: 'Completed / Done' },
  { id: 'cancelled', label: 'Cancelled / No-Show' },
  { id: 'all', label: 'All Appointments' },
];

export function appointmentGroup(appointment) {
  const status = appointmentStage(appointment);
  if (status === 'Completed') return 'completed';
  if (['Cancelled', 'No-Show'].includes(status)) return 'cancelled';
  return 'active';
}

export const appointmentPriority = appointment => String(appointment.priority || (appointment.type === 'Emergency' ? 'Urgent' : '')).trim();
export const appointmentBadgeClass = appointment => ({ Completed: 'completed', Cancelled: 'blocked', 'No-Show': 'blocked', 'In Consultation': 'consultation', 'Checked-In': 'arrived', Waiting: 'arrived', Open: 'open' }[appointmentStage(appointment)] || '');

export function filterAppointmentQueue(appointments, { view = 'active', search = '', date = '', doctors = [] } = {}) {
  const query = search.trim().toLowerCase();
  return appointments.filter(appointment => {
    if (view !== 'all' && appointmentGroup(appointment) !== view) return false;
    if (date && dateOnly(appointment.date) !== date) return false;
    const specialty = specialtyLabel(appointment.specialty || doctors.find(doctor => doctor.name === appointment.doctor)?.specialty);
    return !query || [appointment.patientName, appointment.patientId, appointment.doctor, appointment.id, appointment.type, normalizeVisitType(appointment.type),
      appointment.status, appointmentStage(appointment), appointment.room, appointment.notes, appointmentPriority(appointment), specialty]
      .filter(Boolean).join(' ').toLowerCase().includes(query);
  }).sort(compareRecordsNewestFirst);
}
