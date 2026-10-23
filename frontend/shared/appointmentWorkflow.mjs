export const APPOINTMENT_TRANSITIONS = {
  Open: ['Open', 'Confirmed', 'Cancelled'],
  Confirmed: ['Confirmed', 'Checked-In', 'Waiting', 'Cancelled'],
  'Checked-In': ['Checked-In', 'Confirmed', 'Waiting', 'In Consultation', 'Completed', 'Cancelled'],
  Waiting: ['Waiting', 'Checked-In', 'In Consultation', 'Completed', 'Cancelled'],
  'In Consultation': ['In Consultation', 'Completed', 'Cancelled'],
  Completed: ['Completed'],
  Cancelled: ['Cancelled'],
};

// Booking status distinguishes scheduled patients from patients who have arrived.
// Clinical progress can still be present on older records using two status fields.
export function appointmentStage(appointment) {
  if (!appointment) return '';
  const terminal = status => /^(done|completed)$/i.test(status || '') ? 'Completed' :
    /^cancelled$/i.test(status || '') ? 'Cancelled' : /^no[ -]?show$/i.test(status || '') ? 'No-Show' : '';
  if (terminal(appointment.status)) return terminal(appointment.status);
  if (appointment.status === 'Open') return 'Open';
  if (terminal(appointment.visitStatus)) return terminal(appointment.visitStatus);
  if (appointment.visitStatus === 'In Consultation') return appointment.visitStatus;
  return appointment.status || appointment.visitStatus || 'Confirmed';
}

export const isTerminalAppointment = appointment => ['Completed', 'Cancelled', 'No-Show'].includes(appointmentStage(appointment));

export function canUndoCheckIn(appointment) {
  return appointment?.status === 'Checked-In' && appointmentStage(appointment) === 'Checked-In';
}

export function canTransitionAppointment(before, after) {
  if (!before) return true;
  if (!APPOINTMENT_TRANSITIONS[before.status]?.includes(after.status)) return false;
  if (before.status === 'Checked-In' && after.status === 'Confirmed') return canUndoCheckIn(before);
  if (['In Consultation', 'Completed'].includes(appointmentStage(before)) &&
      ['Confirmed', 'Checked-In', 'Waiting'].includes(after.status)) return false;
  return true;
}
