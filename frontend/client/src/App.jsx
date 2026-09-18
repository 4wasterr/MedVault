import React, { useState } from 'react';
import Login from './pages/login';
import ReceptionistDashboard from './pages/receptionistDashboard';
import PatientsModuleReceptionist from './pages/patientsModuleReceptionist';

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'login') return null;
    return localStorage.getItem('medvault_user') || 'Receptionist';
  });

  const [currentView, setCurrentView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'patients') return 'patients';
    return 'dashboard';
  });

  // Shared Patients State between Dashboard and Patients Module
  const [patients, setPatients] = useState([
    {
      id: 'PTNT-001',
      name: 'Juan Martinez',
      age: 34,
      status: 'Waiting',
      sex: 'Male',
      contact: '0917-123-4567',
      address: '123 Rizal St., Sampaloc, Manila',
      emergencyName: 'Maria Martinez',
      emergencyContact: '0917-987-6543',
      doctor: 'Dr. Santos',
    },
    {
      id: 'PTNT-002',
      name: 'Ken Ty',
      age: 16,
      status: 'In Room',
      sex: 'Male',
      contact: '0918-234-5678',
      address: '456 Taft Ave., Pasay City',
      emergencyName: 'Susan Ty',
      emergencyContact: '0918-876-5432',
      doctor: 'Dr. Reyes',
    },
    {
      id: 'PTNT-003',
      name: 'Allen Tracy',
      age: 21,
      status: 'Done',
      sex: 'Female',
      contact: '0919-345-6789',
      address: '789 Quezon Ave., Quezon City',
      emergencyName: 'Robert Tracy',
      emergencyContact: '0919-765-4321',
      doctor: 'Dr. Cruz',
    },
    {
      id: 'PTNT-004',
      name: 'Abigail Yatco',
      age: 35,
      status: 'Waiting',
      sex: 'Female',
      contact: '0920-456-7890',
      address: '321 Shaw Blvd., Mandaluyong City',
      emergencyName: 'Carlos Yatco',
      emergencyContact: '0920-654-3210',
      doctor: 'Dr. Rebucayo',
    },
  ]);

  const handleLogin = (user) => {
    localStorage.setItem('medvault_user', user);
    setCurrentUser(user);
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('medvault_user');
    setCurrentUser(null);
  };

  if (!currentUser) {
    return <Login onLoginSuccess={handleLogin} />;
  }

  if (currentView === 'patients') {
    return (
      <PatientsModuleReceptionist
        onNavigate={setCurrentView}
        onLogout={handleLogout}
        patients={patients}
        setPatients={setPatients}
      />
    );
  }

  return (
    <ReceptionistDashboard
      receptionistName={currentUser}
      onNavigate={setCurrentView}
      onLogout={handleLogout}
      patients={patients}
      setPatients={setPatients}
    />
  );
}
