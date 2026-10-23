import React from 'react';
import { isPastPatient } from '../medical secretary/medsecData';
import './PatientHistoryBadge.css';

export default function PatientHistoryBadge({ patient, appointments = [] }) {
  const past = isPastPatient(patient, appointments);
  return <span className={`patient-history-badge ${past ? 'past' : 'new'}`}
    title={past ? 'Has a previous recorded visit or completed appointment.' : 'No previous recorded visits or completed appointments.'}>
    {past ? 'Past Patient' : 'New Patient'}
  </span>;
}
