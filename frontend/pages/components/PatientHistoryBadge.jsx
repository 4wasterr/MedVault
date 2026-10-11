import React from 'react';
import { isPastPatient } from '../medical secretary/medsecData';
import './PatientHistoryBadge.css';

export default function PatientHistoryBadge({ patient, appointments = [] }) {
  const past = isPastPatient(patient, appointments);
  return <span className={`patient-history-badge ${past ? 'past' : 'new'}`}
    title={past ? 'Has saved medical details or a completed visit.' : 'No saved medical details or completed visits yet.'}>
    {past ? 'Past Patient' : 'New Patient'}
  </span>;
}
