import React from 'react';
import { isPatientArchived } from '../../shared/patientArchive.mjs';
import './PatientArchiveControls.css';

export default function PatientArchiveControls({ value, onChange }) {
  return <div className="patient-archive-controls" role="group" aria-label="Patient archive status">
    {['Active', 'Archived', 'All'].map(status => <button key={status} type="button" aria-pressed={value === status} onClick={() => onChange(status)}>{status}</button>)}
  </div>;
}

export const matchesPatientArchive = (patient, filter) => filter === 'All' || isPatientArchived(patient) === (filter === 'Archived');
