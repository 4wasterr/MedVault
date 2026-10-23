export const isPatientArchived = patient => patient?.archived === true || patient?.isArchived === true || /^archived$/i.test(patient?.status || '');

export function setPatientArchived(patient, archived, now = new Date().toISOString()) {
  return { ...patient, archived, isArchived: archived, archivedAt: archived ? now : '',
    ...(!archived && /^archived$/i.test(patient.status || '') ? { status: 'Waiting' } : {}) };
}
