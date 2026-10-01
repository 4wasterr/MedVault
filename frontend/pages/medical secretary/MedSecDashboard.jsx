import React from 'react';
import ReceptionistDashboard from '../receptionist/receptionistDashboard';
import './MedSecDashboard.css';

export default function MedSecDashboard(props) {
  return <ReceptionistDashboard {...props} role="Medical Secretary" receptionistName="Medical Secretary" />;
}
