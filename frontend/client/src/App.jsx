import React, { useState, Component } from 'react';
import Login from './pages/login';
import ReceptionistDashboard from './pages/receptionistDashboard';
import PatientsModuleReceptionist from './pages/patientsModuleReceptionist';
import Appointment from './pages/appointment';

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
        if (params.get('view') === 'appointments') return 'appointments';
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
      name: 'Juan Dela Cruz',
      age: 34,
      sex: 'Male',
      birthday: 'Jan 10, 1991',
      contact: '0991-123-1245',
      address: '143 Jose St., Malabon City',
      emergencyName: 'Maria Dela Cruz',
      emergencyContact: '0991-123-1245',
      doctor: 'Dr. Cruz',
      type: 'Checkup',
      status: 'Waiting',
      date: 'September 16, 2026',
      vitals: { bp: '120/80', hr: '72', temp: '36.5', respRate: '18', spo2: '98', weight: '68', height: '172' },
      medical: { allergies: 'Penicillin, Peanuts', history: 'Hypertension (diagnosed 2022)', diagnosis: 'Mild Essential Hypertension', medications: 'Amlodipine 5mg OD', treatment: 'Lifestyle modification, low sodium diet', notes: 'Follow-up in 2 weeks for BP check' },
      appointments: [ { date: 'Sep 15, 2026', doctor: 'Dr. Reyes', type: 'Checkup', status: 'Done' }, { date: 'Sep 25, 2026', doctor: 'Dr. Reyes', type: 'Follow-up', status: 'Scheduled' } ]
    },
    {
      id: 'PTNT-002',
      name: 'Allen Tracy',
      age: 21,
      sex: 'Female',
      birthday: 'Aug 24, 2005',
      contact: '0919-345-6789',
      address: '789 Quezon Ave., Quezon City',
      emergencyName: 'Robert Tracy',
      emergencyContact: '0919-765-4321',
      doctor: 'Dr. Rebuyaco',
      type: 'Follow up',
      status: 'In Room',
      date: 'September 15, 2026',
      vitals: { bp: '110/70', hr: '68', temp: '36.8', respRate: '16', spo2: '99', weight: '54', height: '162' },
      medical: { allergies: 'None reported', history: 'Mild seasonal allergic rhinitis', diagnosis: 'Acute Rhinitis (Resolving)', medications: 'Cetirizine 10mg PRN', treatment: 'Oral hydration, rest', notes: 'Symptoms improved significantly' },
      appointments: [ { date: 'Sep 02, 2026', doctor: 'Dr. Rebuyaco', type: 'Checkup', status: 'Done' }, { date: 'Sep 15, 2026', doctor: 'Dr. Rebuyaco', type: 'Follow up', status: 'Done' } ]
    },
    {
      id: 'PTNT-003',
      name: 'Richiebelle Del Rosario',
      age: 16,
      sex: 'Female',
      birthday: 'May 14, 2010',
      contact: '0918-234-5678',
      address: '456 Taft Ave., Pasay City',
      emergencyName: 'Susan Del Rosario',
      emergencyContact: '0918-876-5432',
      doctor: 'Dr. Santos',
      type: 'Consultation',
      status: 'Done',
      date: 'September 13, 2026',
      vitals: { bp: '118/75', hr: '76', temp: '37.1', respRate: '18', spo2: '98', weight: '49', height: '158' },
      medical: { allergies: 'Aspirin', history: 'Childhood Asthma', diagnosis: 'Upper Respiratory Tract Infection', medications: 'Salbutamol inhaler PRN, Paracetamol 500mg', treatment: 'Inhalation therapy as needed', notes: 'Clear chest sounds on auscultation' },
      appointments: [ { date: 'Sep 13, 2026', doctor: 'Dr. Santos', type: 'Consultation', status: 'Done' } ]
    },
    {
      id: 'PTNT-004',
      name: 'John Smith',
      age: 19,
      sex: 'Male',
      birthday: 'Nov 03, 2007',
      contact: '0920-456-7890',
      address: '321 Shaw Blvd., Mandaluyong City',
      emergencyName: 'Carlos Smith',
      emergencyContact: '0920-654-3210',
      doctor: 'Dr. Reyes',
      type: 'Checkup',
      status: 'Waiting',
      date: 'September 13, 2026',
      vitals: { bp: '115/75', hr: '70', temp: '36.6', respRate: '16', spo2: '99', weight: '65', height: '175' },
      medical: { allergies: 'None', history: 'None', diagnosis: 'Routine General Wellness Exam', medications: 'Multivitamins OD', treatment: 'Maintain balanced diet and exercise', notes: 'Fit and healthy' },
      appointments: [ { date: 'Sep 13, 2026', doctor: 'Dr. Reyes', type: 'Checkup', status: 'Done' } ]
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
      ) : currentView === 'appointments' ? (
        <Appointment
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
