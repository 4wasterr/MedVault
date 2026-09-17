import React, { useState } from 'react';
import Login from './pages/login';
import NurseDashboard from './pages/nurseDashboard';

export default function App() {
  const [currentNurse, setCurrentNurse] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'login') return null;
    return localStorage.getItem('medvault_user') || 'Nurse';
  });

  const handleLogin = (nurse) => {
    localStorage.setItem('medvault_user', nurse);
    setCurrentNurse(nurse);
  };

  const handleLogout = () => {
    localStorage.removeItem('medvault_user');
    setCurrentNurse(null);
  };

  return currentNurse ? (
    <NurseDashboard
      nurseName={currentNurse}
      onLogout={handleLogout}
    />
  ) : (
    <Login onLoginSuccess={handleLogin} />
  );
}
