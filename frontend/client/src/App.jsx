import React, { useState, Component } from 'react';
import Login from './pages/login';
import ReceptionistDashboard from './pages/receptionistDashboard';
import PatientsModuleReceptionist from './pages/patientsModuleReceptionist';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('MedVault App Render Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif', textAlign: 'center', background: '#F8FAFC', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ color: '#0F172A', marginBottom: '12px' }}>Something went wrong loading this view</h2>
          <p style={{ color: '#64748B', maxWidth: '500px', marginBottom: '20px' }}>
            A temporary render error occurred. Click below to refresh and reset the view.
          </p>
          <pre style={{ color: '#EF4444', background: '#FFFFFF', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', maxWidth: '600px', textAlign: 'left', overflow: 'auto', marginBottom: '20px' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            onClick={() => {
              localStorage.removeItem('medvault_user');
              window.location.href = '/';
            }}
            style={{ padding: '10px 24px', background: '#00ADEF', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Reload MedVault
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.location) {
        const params = new URLSearchParams(window.location.search);
        if (params.get('view') === 'login') return null;
      }
      return (typeof localStorage !== 'undefined' && localStorage.getItem('medvault_user')) || 'Receptionist';
    } catch {
      return 'Receptionist';
    }
  });

  const [currentView, setCurrentView] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.location) {
        const params = new URLSearchParams(window.location.search);
        if (params.get('view') === 'patients') return 'patients';
      }
      return 'dashboard';
    } catch {
      return 'dashboard';
    }
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

  return (
    <ErrorBoundary>
      {!currentUser ? (
        <Login onLoginSuccess={handleLogin} />
      ) : currentView === 'patients' ? (
        <PatientsModuleReceptionist
          onNavigate={setCurrentView}
          onLogout={handleLogout}
          patients={patients}
          setPatients={setPatients}
        />
      ) : (
        <ReceptionistDashboard
          receptionistName={currentUser}
          onNavigate={setCurrentView}
          onLogout={handleLogout}
          patients={patients}
          setPatients={setPatients}
        />
      )}
    </ErrorBoundary>
  );
}
