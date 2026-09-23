import React, { useState } from 'react';
import './receptionistDashboard.css';
import './patientsModuleReceptionist.css';

export default function PatientsModuleReceptionist({
  onNavigate,
  onLogout,
  patients: propPatients,
  setPatients: propSetPatients,
}) {
  // Rich Default Patients with complete Personal Info, Vitals, Medical Info & Appointment History
  const defaultPatients = [
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
      vitals: {
        bp: '120/80',
        hr: '72',
        temp: '36.5',
        respRate: '18',
        spo2: '98',
        weight: '68',
        height: '172',
      },
      medical: {
        allergies: 'Penicillin, Peanuts',
        history: 'Hypertension (diagnosed 2022)',
        diagnosis: 'Mild Essential Hypertension',
        medications: 'Amlodipine 5mg OD',
        treatment: 'Lifestyle modification, low sodium diet',
        notes: 'Follow-up in 2 weeks for BP check',
      },
      appointments: [
        { date: 'Sep 15, 2026', doctor: 'Dr. Reyes', type: 'Checkup', status: 'Done' },
        { date: 'Sep 25, 2026', doctor: 'Dr. Reyes', type: 'Follow-up', status: 'Scheduled' },
      ],
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
      vitals: {
        bp: '110/70',
        hr: '68',
        temp: '36.8',
        respRate: '16',
        spo2: '99',
        weight: '54',
        height: '162',
      },
      medical: {
        allergies: 'None reported',
        history: 'Mild seasonal allergic rhinitis',
        diagnosis: 'Acute Rhinitis (Resolving)',
        medications: 'Cetirizine 10mg PRN',
        treatment: 'Oral hydration, rest',
        notes: 'Symptoms improved significantly',
      },
      appointments: [
        { date: 'Sep 02, 2026', doctor: 'Dr. Rebuyaco', type: 'Checkup', status: 'Done' },
        { date: 'Sep 15, 2026', doctor: 'Dr. Rebuyaco', type: 'Follow up', status: 'Done' },
      ],
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
      vitals: {
        bp: '118/75',
        hr: '76',
        temp: '37.1',
        respRate: '18',
        spo2: '98',
        weight: '49',
        height: '158',
      },
      medical: {
        allergies: 'Aspirin',
        history: 'Childhood Asthma',
        diagnosis: 'Upper Respiratory Tract Infection',
        medications: 'Salbutamol inhaler PRN, Paracetamol 500mg',
        treatment: 'Inhalation therapy as needed',
        notes: 'Clear chest sounds on auscultation',
      },
      appointments: [
        { date: 'Sep 13, 2026', doctor: 'Dr. Santos', type: 'Consultation', status: 'Done' },
      ],
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
      vitals: {
        bp: '115/75',
        hr: '70',
        temp: '36.6',
        respRate: '16',
        spo2: '99',
        weight: '65',
        height: '175',
      },
      medical: {
        allergies: 'None',
        history: 'None',
        diagnosis: 'Routine General Wellness Exam',
        medications: 'Multivitamins OD',
        treatment: 'Maintain balanced diet and exercise',
        notes: 'Fit and healthy',
      },
      appointments: [
        { date: 'Sep 13, 2026', doctor: 'Dr. Reyes', type: 'Checkup', status: 'Done' },
      ],
    },
  ];

  const [localPatients, setLocalPatients] = useState(defaultPatients);
  const patients = propPatients || localPatients;
  const setPatients = propSetPatients || setLocalPatients;

  // Selected Patient State for Master-Detail Panel (null = Empty State)
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Active Tab inside Patient Profile: 'personal' | 'vitals' | 'medical' | 'appointments'
  const [activeTab, setActiveTab] = useState('personal');

  // Edit Mode state for Personal Info
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({});

  // Search, Status Filter, Doctor Filter, and Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedDoctor, setSelectedDoctor] = useState('All');
  const [sortBy, setSortBy] = useState('default');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Modals & Header menus
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Normalize patient status / visit type to one of: 'Checkup', 'Follow up', 'Consultation'
  const getPatientType = (p) => {
    if (!p) return 'Checkup';
    const raw = (p.type || p.status || '').trim();
    if (/follow/i.test(raw)) return 'Follow up';
    if (/consult/i.test(raw)) return 'Consultation';
    if (/check/i.test(raw)) return 'Checkup';
    return raw || 'Checkup';
  };

  // Pic 3 Register Patient Form State
  const [registerForm, setRegisterForm] = useState({
    firstName: '',
    sex: '',
    middleName: '',
    contactNumber: '',
    lastName: '',
    address: '',
    type: 'Checkup',
    emergFirstName: '',
    emergContactNumber: '',
    emergMiddleName: '',
    emergLastName: '',
  });

  const [registerErrors, setRegisterErrors] = useState({});

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 3200);
  };

  // Handle selecting a patient card - initializes personal edit form data
  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    setIsEditing(false);
    setEditFormData({ ...patient });
  };

  // Handle saving edits on Personal Info
  const handleSaveEdit = (e) => {
    if (e) e.preventDefault();
    if (!selectedPatient) return;
    const updated = {
      ...selectedPatient,
      ...editFormData,
    };
    setSelectedPatient(updated);
    setPatients((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setIsEditing(false);
    showToast(`Updated profile for ${updated.name}`);
  };

  // Handle registering a new patient
  const handleRegisterSubmit = (e) => {
    e.preventDefault();
    const errors = {};

    if (!registerForm.firstName.trim()) errors.firstName = 'First name is required';
    if (!registerForm.lastName.trim()) errors.lastName = 'Last name is required';
    if (!registerForm.sex) errors.sex = 'Please select sex';
    if (!registerForm.address.trim()) errors.address = 'Address is required';

    if (Object.keys(errors).length > 0) {
      setRegisterErrors(errors);
      return;
    }

    const nextNum = patients.length + 1;
    const formattedId = `PTNT-${String(nextNum).padStart(3, '0')}`;
    const fullName = `${registerForm.firstName} ${registerForm.middleName ? registerForm.middleName + ' ' : ''}${registerForm.lastName}`.trim();
    const emergFullName = `${registerForm.emergFirstName} ${registerForm.emergLastName}`.trim();

    const newPatientObj = {
      id: formattedId,
      name: fullName,
      age: 28,
      sex: registerForm.sex || 'Male',
      birthday: 'Jan 01, 1998',
      contact: registerForm.contactNumber || '0917-000-0000',
      address: registerForm.address,
      emergencyName: emergFullName || 'Emergency Contact',
      emergencyContact: registerForm.emergContactNumber || 'N/A',
      doctor: 'Dr. Santos',
      type: registerForm.type || 'Checkup',
      status: 'Waiting',
      date: 'September 19, 2026',
      vitals: {
        bp: '120/80',
        hr: '72',
        temp: '36.5',
        respRate: '18',
        spo2: '98',
        weight: '65',
        height: '170',
      },
      medical: {
        allergies: 'None reported',
        history: 'No significant past illness',
        diagnosis: 'New Patient Intake Examination',
        medications: 'None',
        treatment: 'Comprehensive physical evaluation',
        notes: 'Vital signs within normal limits',
      },
      appointments: [
        { date: 'Sep 19, 2026', doctor: 'Dr. Santos', type: registerForm.type || 'Checkup', status: 'Scheduled' },
      ],
    };

    setPatients((prev) => [newPatientObj, ...prev]);
    setSelectedPatient(newPatientObj);
    setIsEditing(false);
    setEditFormData({ ...newPatientObj });
    setShowRegisterModal(false);
    showToast(`Patient ${fullName} (${formattedId}) registered!`);

    setRegisterForm({
      firstName: '',
      sex: '',
      middleName: '',
      contactNumber: '',
      lastName: '',
      address: '',
      type: 'Checkup',
      emergFirstName: '',
      emergContactNumber: '',
      emergMiddleName: '',
      emergLastName: '',
    });
  };

  // Filter patients by search text, status filter, doctor filter, and sorting
  const filteredPatients = patients
    .filter((p) => {
      const q = searchQuery.toLowerCase().trim();
      const pType = getPatientType(p);
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.doctor && p.doctor.toLowerCase().includes(q)) ||
        pType.toLowerCase().includes(q);

      const matchesStatus =
        activeFilter === 'All' ||
        pType.toLowerCase() === activeFilter.toLowerCase();

      const matchesDoctor =
        selectedDoctor === 'All' ||
        (p.doctor && p.doctor.toLowerCase() === selectedDoctor.toLowerCase());

      return matchesSearch && matchesStatus && matchesDoctor;
    })
    .sort((a, b) => {
      if (sortBy === 'name-asc') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'age-asc') {
        return (Number(a.age) || 0) - (Number(b.age) || 0);
      }
      if (sortBy === 'age-desc') {
        return (Number(b.age) || 0) - (Number(a.age) || 0);
      }
      return 0;
    });

  return (
    <div className="nd-screen-container">
      <div className="nd-dashboard-frame">
        {/* =========================================================================
            LEFT SIDEBAR (Capsule Nav 1:1 with Reference Design)
            ========================================================================= */}
        <aside className="nd-sidebar">
          {/* Top Medical Red Cross */}
          <div
            className="nd-sidebar-logo"
            title="MedVault Care"
            onClick={() => onNavigate && onNavigate('dashboard')}
          >
            <svg viewBox="0 0 46 46" width="46" height="46" fill="none">
              <rect x="17" y="3" width="12" height="40" rx="6" fill="#FF4D4D" />
              <rect x="3" y="17" width="40" height="12" rx="6" fill="#FF4D4D" />
            </svg>
          </div>

          {/* Capsule Menu (Patients Module Active) */}
          <nav className="nd-sidebar-nav">
            {/* 1. Home / Dashboard */}
            <button
              type="button"
              className="nav-btn"
              onClick={() => onNavigate && onNavigate('dashboard')}
              title="Dashboard"
              aria-label="Dashboard"
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="#00ADEF">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
              </svg>
            </button>

            {/* 2. Patients Module (Active with cyan filled circle & white icon) */}
            <button
              type="button"
              className="nav-btn active"
              title="Patients Module"
              aria-label="Patients Module"
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
                <circle cx="10" cy="8" r="4" fill="#ffffff" />
                <path d="M2 18c0-3.3 3.6-6 8-6s8 2.7 8 6v1H2v-1z" fill="#ffffff" />
                <circle cx="18" cy="17" r="4.5" fill="#ffffff" />
                <path d="M18 15v4M16 17h4" stroke="#00ADEF" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>

            {/* 3. Appointments Module */}
            <button
              type="button"
              className="nav-btn"
              onClick={() => onNavigate && onNavigate('appointments')}
              title="Appointments Module"
              aria-label="Appointments Module"
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
                <rect x="4" y="5" width="13" height="16" rx="2" fill="#00ADEF" />
                <rect x="7" y="3" width="7" height="3" rx="1.5" fill="#00ADEF" />
                <path d="M7 10h5M7 13h5M7 16h3" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="17.5" cy="16.5" r="3.5" fill="#ffffff" stroke="#00ADEF" strokeWidth="2" />
                <line x1="20" y1="19" x2="22.5" y2="21.5" stroke="#00ADEF" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
          </nav>

          {/* Bottom Floating Power Button */}
          <div className="nd-sidebar-footer">
            <button
              type="button"
              className="power-btn"
              onClick={() => setShowLogoutConfirm(true)}
              title="Sign Out"
              aria-label="Sign Out"
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#00ADEF" strokeWidth="2.6" strokeLinecap="round">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                <line x1="12" y1="2" x2="12" y2="12" />
              </svg>
            </button>
          </div>
        </aside>

        {/* =========================================================================
            MAIN WORKSPACE (Master-Detail 2-Column Layout matching Pic 1 & Pic 2)
            ========================================================================= */}
        <main className="pm-workspace">
          {/* TOP HEADER */}
          <header className="pm-header">
            <div className="pm-header-titles">
              <h1 className="pm-main-title">Patients Module</h1>
              <p className="pm-main-subtitle">Manage and track patient's statuses and info</p>
            </div>

            <div className="pm-header-right">
              {/* Notification Bell */}
              <div className="notif-wrapper">
                <button
                  type="button"
                  className="header-icon-btn"
                  onClick={() => {
                    setShowNotifications(!showNotifications);
                    setShowProfileMenu(false);
                  }}
                  title="Notifications"
                  aria-label="Notifications"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="#00ADEF">
                    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                  </svg>
                </button>

                {showNotifications && (
                  <div className="notif-dropdown animate-pop-in">
                    <div className="dropdown-title">Clinical Notifications</div>
                    <div className="notif-row">
                      <strong>Juan Dela Cruz</strong> completed triage vital check.
                    </div>
                    <div className="notif-row">
                      <strong>Allen Tracy</strong> follow-up scheduled for 2:30 pm.
                    </div>
                  </div>
                )}
              </div>

              {/* Avatar Pill */}
              <div className="avatar-wrapper">
                <button
                  type="button"
                  className="avatar-circle-btn"
                  onClick={() => {
                    setShowProfileMenu(!showProfileMenu);
                    setShowNotifications(false);
                  }}
                  title="Receptionist"
                  aria-label="Profile"
                >
                  <span>A</span>
                </button>

                {showProfileMenu && (
                  <div className="avatar-dropdown animate-pop-in">
                    <div className="avatar-nurse-name">Receptionist</div>
                    <div className="avatar-duty-tag">● On Duty</div>
                    <button
                      type="button"
                      className="menu-signout-btn"
                      onClick={() => setShowLogoutConfirm(true)}
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* 2-COLUMN MASTER-DETAIL WORKSPACE */}
          <div className="pm-split-layout">
            {/* =====================================================================
                LEFT COLUMN: FILTER CARD + PATIENT CARDS LIST
                ===================================================================== */}
            <div className="pm-left-col">
              {/* Top Filter Card (1:1 with Pic 1 & Pic 2) */}
              <div className="pm-filter-card">
                {/* Row 1: Search Pill & + Register a Patient Button */}
                <div className="pm-filter-top-row">
                  <div className="pm-search-box">
                    <svg className="pm-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#64748B" strokeWidth="2.2" strokeLinecap="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search patient, ID, doctor..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pm-search-input"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        className="pm-search-clear-btn"
                        onClick={() => setSearchQuery('')}
                        title="Clear search"
                        aria-label="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    className="pm-register-action-btn"
                    onClick={() => setShowRegisterModal(true)}
                    title="Register a Patient"
                  >
                    + Register a Patient
                  </button>
                </div>

                {/* Row 2: Filter Badges & Interactive Dropdown */}
                <div className="pm-filter-badge-row">
                  <button
                    type="button"
                    className={`pm-pill-btn ${activeFilter === 'All' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('All')}
                  >
                    All Statuses
                  </button>

                  <button
                    type="button"
                    className={`pm-pill-btn ${activeFilter === 'Checkup' ? 'active' : ''}`}
                    onClick={() => setActiveFilter(activeFilter === 'Checkup' ? 'All' : 'Checkup')}
                  >
                    Checkup
                  </button>

                  <button
                    type="button"
                    className={`pm-pill-btn ${activeFilter === 'Follow up' ? 'active' : ''}`}
                    onClick={() => setActiveFilter(activeFilter === 'Follow up' ? 'All' : 'Follow up')}
                  >
                    Follow up
                  </button>

                  <button
                    type="button"
                    className={`pm-pill-btn ${activeFilter === 'Consultation' ? 'active' : ''}`}
                    onClick={() => setActiveFilter(activeFilter === 'Consultation' ? 'All' : 'Consultation')}
                  >
                    Consultation
                  </button>

                  {/* Advanced Filter Popover */}
                  <div className="pm-filter-btn-wrapper">
                    <button
                      type="button"
                      className={`pm-pill-btn pm-filter-btn ${
                        showFilterMenu || selectedDoctor !== 'All' || sortBy !== 'default' ? 'active' : ''
                      }`}
                      onClick={() => setShowFilterMenu(!showFilterMenu)}
                      title="Filter and sort options"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                      </svg>
                      Filter {selectedDoctor !== 'All' || sortBy !== 'default' ? '●' : ''}
                    </button>

                    {showFilterMenu && (
                      <div className="pm-filter-dropdown animate-pop-in">
                        <div className="pm-dropdown-header">
                          <span className="pm-dropdown-title">Filter & Sort</span>
                          <button
                            type="button"
                            className="pm-dropdown-close"
                            onClick={() => setShowFilterMenu(false)}
                            aria-label="Close menu"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="pm-dropdown-section">
                          <label className="pm-dropdown-label">Attending Doctor</label>
                          <select
                            className="pm-dropdown-select"
                            value={selectedDoctor}
                            onChange={(e) => setSelectedDoctor(e.target.value)}
                          >
                            <option value="All">All Doctors</option>
                            <option value="Dr. Cruz">Dr. Cruz</option>
                            <option value="Dr. Rebuyaco">Dr. Rebuyaco</option>
                            <option value="Dr. Santos">Dr. Santos</option>
                            <option value="Dr. Reyes">Dr. Reyes</option>
                          </select>
                        </div>

                        <div className="pm-dropdown-section">
                          <label className="pm-dropdown-label">Sort By</label>
                          <select
                            className="pm-dropdown-select"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                          >
                            <option value="default">Default Queue</option>
                            <option value="name-asc">Patient Name (A-Z)</option>
                            <option value="age-asc">Age (Youngest First)</option>
                            <option value="age-desc">Age (Oldest First)</option>
                          </select>
                        </div>

                        <div className="pm-dropdown-actions">
                          <button
                            type="button"
                            className="pm-dropdown-reset-btn"
                            onClick={() => {
                              setSelectedDoctor('All');
                              setSortBy('default');
                              setActiveFilter('All');
                              setShowFilterMenu(false);
                            }}
                          >
                            Reset All
                          </button>
                          <button
                            type="button"
                            className="pm-dropdown-apply-btn"
                            onClick={() => setShowFilterMenu(false)}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Patient List Card (Stacked Rows - 1:1 with Pic 1) */}
              <div className="pm-patient-list-card">
                {filteredPatients.length > 0 ? (
                  filteredPatients.map((patient) => {
                    const isSelected = selectedPatient?.id === patient.id;
                    return (
                      <div
                        key={patient.id}
                        className={`pm-patient-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelectPatient(patient)}
                      >
                        <div className="pm-item-left">
                          <span className="pm-item-id">{patient.id}</span>
                          <h4 className="pm-item-name">{patient.name}</h4>
                          <span className="pm-item-meta">
                            {patient.age} years old | {getPatientType(patient)}
                          </span>
                          <span className="pm-item-doc">{patient.doctor}</span>
                        </div>

                        <div className="pm-item-right">
                          <span className="pm-item-date">{patient.date}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="pm-empty-list">
                    No patients found matching your search.
                  </div>
                )}
              </div>
            </div>

            {/* =====================================================================
                RIGHT COLUMN: EMPTY STATE (Pic 1) OR PATIENT PROFILE (Pic 2, 3, 4, 5)
                ===================================================================== */}
            <div className="pm-right-col">
              {!selectedPatient ? (
                /* Empty State: No patient selected (1:1 with Pic 1) */
                <div className="pm-empty-state-panel">
                  <div className="pm-empty-icon-box">
                    <svg viewBox="0 0 48 56" width="56" height="64" fill="none">
                      <rect x="6" y="8" width="36" height="44" rx="4" stroke="#CBD5E1" strokeWidth="2.5" />
                      <rect x="16" y="3" width="16" height="9" rx="2.5" stroke="#CBD5E1" strokeWidth="2.5" fill="#ffffff" />
                      <line x1="14" y1="22" x2="34" y2="22" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
                      <line x1="14" y1="29" x2="34" y2="29" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
                      <line x1="14" y1="36" x2="34" y2="36" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
                      <line x1="14" y1="43" x2="26" y2="43" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <h3 className="pm-empty-title">No patient selected</h3>
                  <p className="pm-empty-subtitle">Select a patient to view their details.</p>
                </div>
              ) : (
                /* Patient Profile Card (1:1 with Pic 2, 3, 4, 5) */
                <div className="pm-profile-card animate-fade">
                  {/* Card Header with Close button */}
                  <div className="pm-profile-top-bar">
                    <h2 className="pm-profile-title">Patient Profile</h2>
                    <button
                      type="button"
                      className="pm-profile-close-x"
                      onClick={() => setSelectedPatient(null)}
                      title="Close Profile"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Header Patient Summary Row */}
                  <div className="pm-profile-summary">
                    <div className="pm-summary-avatar">
                      <svg viewBox="0 0 88 88" width="76" height="76" fill="none">
                        <circle cx="44" cy="44" r="44" fill="#5BA4E6" />
                        <path d="M18 88c0-15 12-24 26-24s26 9 26 24z" fill="#FFFFFF" />
                        <path d="M38 52h12v15h-12z" fill="#F9C5A9" />
                        <path d="M38 60l6 9 6-9" stroke="#E2E8F0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        <ellipse cx="44" cy="42" rx="15" ry="18" fill="#F9C5A9" />
                        <circle cx="28.5" cy="42" r="3.2" fill="#F9C5A9" />
                        <circle cx="59.5" cy="42" r="3.2" fill="#F9C5A9" />
                        <path d="M29 37c0-11 7-18 15-18s15 7 15 18c0 2-1 4-3 4-2-7-6-10-12-10s-10 3-12 10c-2 0-3-2-3-4z" fill="#1E293B" />
                        <path d="M30 35c2-8 8-13 14-13s12 5 14 13c-3-4-8-6-14-6s-11 2-14 6z" fill="#0F172A" />
                      </svg>
                    </div>

                    <div className="pm-summary-info">
                      <div className="pm-summary-id">{selectedPatient.id}</div>
                      <h3 className="pm-summary-name">{selectedPatient.name}</h3>
                      <div className="pm-summary-meta">
                        {selectedPatient.age} years old | {selectedPatient.sex || 'Male'}
                      </div>
                      <div className="pm-summary-phone">{selectedPatient.contact}</div>
                    </div>
                  </div>

                  {/* 4 Interactive Profile Tabs */}
                  <div className="pm-tabs-bar" role="tablist">
                    <button
                      type="button"
                      className={`pm-tab-btn ${activeTab === 'personal' ? 'active' : ''}`}
                      onClick={() => setActiveTab('personal')}
                    >
                      Personal Info
                    </button>
                    <button
                      type="button"
                      className={`pm-tab-btn ${activeTab === 'vitals' ? 'active' : ''}`}
                      onClick={() => setActiveTab('vitals')}
                    >
                      Vital Signs
                    </button>
                    <button
                      type="button"
                      className={`pm-tab-btn ${activeTab === 'medical' ? 'active' : ''}`}
                      onClick={() => setActiveTab('medical')}
                    >
                      Medical Info
                    </button>
                    <button
                      type="button"
                      className={`pm-tab-btn ${activeTab === 'appointments' ? 'active' : ''}`}
                      onClick={() => setActiveTab('appointments')}
                    >
                      Appointment History
                    </button>
                  </div>

                  {/* TAB 1: Personal Info (1:1 with Pic 2) */}
                  {activeTab === 'personal' && (
                    <div className="pm-tab-content animate-fade">
                      <h4 className="pm-tab-heading">Personal Information</h4>

                      {!isEditing ? (
                        <div className="pm-info-grid-2col">
                          <div className="pm-info-item">
                            <span className="pm-info-lbl">Full Name</span>
                            <span className="pm-info-val">{selectedPatient.name}</span>
                          </div>

                          <div className="pm-info-item">
                            <span className="pm-info-lbl">Birthday</span>
                            <span className="pm-info-val">{selectedPatient.birthday || 'Jan 10, 1991'}</span>
                          </div>

                          <div className="pm-info-item">
                            <span className="pm-info-lbl">Age</span>
                            <span className="pm-info-val">{selectedPatient.age}</span>
                          </div>

                          <div className="pm-info-item">
                            <span className="pm-info-lbl">Sex</span>
                            <span className="pm-info-val">{selectedPatient.sex || 'Male'}</span>
                          </div>

                          <div className="pm-info-item">
                            <span className="pm-info-lbl">Contact Number</span>
                            <span className="pm-info-val">{selectedPatient.contact}</span>
                          </div>

                          <div className="pm-info-item">
                            <span className="pm-info-lbl">Address</span>
                            <span className="pm-info-val">{selectedPatient.address}</span>
                          </div>

                          <div className="pm-info-item">
                            <span className="pm-info-lbl">Emergency Contact</span>
                            <span className="pm-info-val">
                              {selectedPatient.emergencyName} ({selectedPatient.emergencyContact})
                            </span>
                          </div>
                        </div>
                      ) : (
                        <form onSubmit={handleSaveEdit} className="pm-info-grid-2col">
                          <div className="pm-info-item">
                            <span className="pm-info-lbl">Full Name</span>
                            <input
                              type="text"
                              className="pm-input-pill"
                              value={editFormData.name || ''}
                              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                            />
                          </div>

                          <div className="pm-info-item">
                            <span className="pm-info-lbl">Birthday</span>
                            <input
                              type="text"
                              className="pm-input-pill"
                              value={editFormData.birthday || ''}
                              onChange={(e) => setEditFormData({ ...editFormData, birthday: e.target.value })}
                            />
                          </div>

                          <div className="pm-info-item">
                            <span className="pm-info-lbl">Age</span>
                            <input
                              type="number"
                              className="pm-input-pill"
                              value={editFormData.age || ''}
                              onChange={(e) => setEditFormData({ ...editFormData, age: e.target.value })}
                            />
                          </div>

                          <div className="pm-info-item">
                            <span className="pm-info-lbl">Sex</span>
                            <select
                              className="pm-input-pill"
                              value={editFormData.sex || 'Male'}
                              onChange={(e) => setEditFormData({ ...editFormData, sex: e.target.value })}
                            >
                              <option value="Male">Male</option>
                              <option value="Female">Female</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>

                          <div className="pm-info-item">
                            <span className="pm-info-lbl">Contact Number</span>
                            <input
                              type="text"
                              className="pm-input-pill"
                              value={editFormData.contact || ''}
                              onChange={(e) => setEditFormData({ ...editFormData, contact: e.target.value })}
                            />
                          </div>

                          <div className="pm-info-item">
                            <span className="pm-info-lbl">Address</span>
                            <input
                              type="text"
                              className="pm-input-pill"
                              value={editFormData.address || ''}
                              onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                            />
                          </div>

                          <div className="pm-info-item">
                            <span className="pm-info-lbl">Emergency Contact</span>
                            <input
                              type="text"
                              className="pm-input-pill"
                              value={editFormData.emergencyName || ''}
                              onChange={(e) => setEditFormData({ ...editFormData, emergencyName: e.target.value })}
                            />
                          </div>
                        </form>
                      )}

                      {/* Footer Actions: Cancel / Edit */}
                      <div className="pm-profile-actions">
                        <button
                          type="button"
                          className="pm-btn-pill-ghost"
                          onClick={() => {
                            if (isEditing) {
                              setIsEditing(false);
                              setEditFormData({ ...selectedPatient });
                            } else {
                              setSelectedPatient(null);
                            }
                          }}
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          className="pm-btn-pill-cyan"
                          onClick={(e) => {
                            if (isEditing) {
                              handleSaveEdit(e);
                            } else {
                              setIsEditing(true);
                            }
                          }}
                        >
                          {isEditing ? 'Save Changes' : 'Edit'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: Vital Signs (1:1 with media_1789814983567.png - View Only for Receptionist) */}
                  {activeTab === 'vitals' && (
                    <div className="pm-tab-content animate-fade">
                      <h4 className="pm-tab-heading">Vital Signs</h4>

                      <div className="pm-vitals-stack">
                        <div className="pm-vital-row">
                          <label className="pm-vital-label">Blood Pressure</label>
                          <div className="pm-vital-input-wrap">
                            <input
                              type="text"
                              className="pm-vital-input"
                              value={selectedPatient.vitals?.bp || ''}
                              readOnly
                            />
                            <span className="pm-vital-unit">mmHg</span>
                          </div>
                        </div>

                        <div className="pm-vital-row">
                          <label className="pm-vital-label">Heart Rate</label>
                          <div className="pm-vital-input-wrap">
                            <input
                              type="text"
                              className="pm-vital-input"
                              value={selectedPatient.vitals?.hr || ''}
                              readOnly
                            />
                            <span className="pm-vital-unit">bpm</span>
                          </div>
                        </div>

                        <div className="pm-vital-row">
                          <label className="pm-vital-label">Temperature</label>
                          <div className="pm-vital-input-wrap">
                            <input
                              type="text"
                              className="pm-vital-input"
                              value={selectedPatient.vitals?.temp || ''}
                              readOnly
                            />
                            <span className="pm-vital-unit">°C</span>
                          </div>
                        </div>

                        <div className="pm-vital-row">
                          <label className="pm-vital-label">Respiratory Rate</label>
                          <div className="pm-vital-input-wrap">
                            <input
                              type="text"
                              className="pm-vital-input"
                              value={selectedPatient.vitals?.respRate || ''}
                              readOnly
                            />
                            <span className="pm-vital-unit">breaths/min</span>
                          </div>
                        </div>

                        <div className="pm-vital-row">
                          <label className="pm-vital-label">Oxygen Saturation</label>
                          <div className="pm-vital-input-wrap">
                            <input
                              type="text"
                              className="pm-vital-input"
                              value={selectedPatient.vitals?.spo2 || ''}
                              readOnly
                            />
                            <span className="pm-vital-unit">%</span>
                          </div>
                        </div>

                        <div className="pm-vital-row">
                          <label className="pm-vital-label">Weight</label>
                          <div className="pm-vital-input-wrap">
                            <input
                              type="text"
                              className="pm-vital-input"
                              value={selectedPatient.vitals?.weight || ''}
                              readOnly
                            />
                            <span className="pm-vital-unit">kg</span>
                          </div>
                        </div>

                        <div className="pm-vital-row">
                          <label className="pm-vital-label">Height</label>
                          <div className="pm-vital-input-wrap">
                            <input
                              type="text"
                              className="pm-vital-input"
                              value={selectedPatient.vitals?.height || ''}
                              readOnly
                            />
                            <span className="pm-vital-unit">cm</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: Medical Info (1:1 with media_1789814983566.png - View Only for Receptionist) */}
                  {activeTab === 'medical' && (
                    <div className="pm-tab-content animate-fade">
                      <h4 className="pm-tab-heading">Medical Information</h4>

                      <div className="pm-medical-stack">
                        <div className="pm-medical-row">
                          <label className="pm-medical-label">Allergies</label>
                          <input
                            type="text"
                            className="pm-medical-input"
                            value={selectedPatient.medical?.allergies || ''}
                            readOnly
                          />
                        </div>

                        <div className="pm-medical-row">
                          <label className="pm-medical-label">Medical History</label>
                          <input
                            type="text"
                            className="pm-medical-input"
                            value={selectedPatient.medical?.history || ''}
                            readOnly
                          />
                        </div>

                        <div className="pm-medical-row">
                          <label className="pm-medical-label">Diagnosis</label>
                          <input
                            type="text"
                            className="pm-medical-input"
                            value={selectedPatient.medical?.diagnosis || ''}
                            readOnly
                          />
                        </div>

                        <div className="pm-medical-row">
                          <label className="pm-medical-label">Medications</label>
                          <input
                            type="text"
                            className="pm-medical-input"
                            value={selectedPatient.medical?.medications || ''}
                            readOnly
                          />
                        </div>

                        <div className="pm-medical-row">
                          <label className="pm-medical-label">Treatment</label>
                          <input
                            type="text"
                            className="pm-medical-input"
                            value={selectedPatient.medical?.treatment || ''}
                            readOnly
                          />
                        </div>

                        <div className="pm-medical-row">
                          <label className="pm-medical-label">Notes</label>
                          <input
                            type="text"
                            className="pm-medical-input"
                            value={selectedPatient.medical?.notes || ''}
                            readOnly
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 4: Appointment History (View Only for Receptionist) */}
                  {activeTab === 'appointments' && (
                    <div className="pm-tab-content animate-fade">
                      <h4 className="pm-tab-heading">Appointment History</h4>

                      <div className="pm-history-table-card">
                        <table className="pm-history-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Doctor</th>
                              <th>Type</th>
                              <th className="center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedPatient.appointments && selectedPatient.appointments.length > 0 ? (
                              selectedPatient.appointments.map((app, idx) => (
                                <tr key={idx}>
                                  <td>{app.date}</td>
                                  <td>{app.doctor}</td>
                                  <td>{app.type}</td>
                                  <td className="center">
                                    <span
                                      className={`pm-history-badge ${
                                        app.status.toLowerCase() === 'done' ? 'done' : 'scheduled'
                                      }`}
                                    >
                                      {app.status}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan="4" className="empty-history">
                                  No previous appointments recorded.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* =========================================================================
          PIC 3: REGISTER PATIENT MODAL
          ========================================================================= */}
      {showRegisterModal && (
        <div className="pm-modal-backdrop animate-fade" onClick={() => setShowRegisterModal(false)}>
          <div className="pm-modal-card animate-zoom" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="pm-modal-close-btn"
              onClick={() => setShowRegisterModal(false)}
              aria-label="Close modal"
            >
              ✕
            </button>

            <h2 className="pm-modal-title">Register Patient</h2>

            <form onSubmit={handleRegisterSubmit} noValidate>
              {/* SECTION 1: Personal Information */}
              <h3 className="pm-form-section-title">Personal Information</h3>

              <div className="pm-form-grid-2">
                <div className="pm-form-field">
                  <label className="pm-field-label">
                    First Name <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    value={registerForm.firstName}
                    onChange={(e) => setRegisterForm({ ...registerForm, firstName: e.target.value })}
                    placeholder="Enter first name"
                    className="pm-form-input"
                    required
                  />
                  {registerErrors.firstName && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{registerErrors.firstName}</span>
                  )}
                </div>

                <div className="pm-form-field">
                  <label className="pm-field-label">
                    Sex<span className="req">*</span>
                  </label>
                  <select
                    value={registerForm.sex}
                    onChange={(e) => setRegisterForm({ ...registerForm, sex: e.target.value })}
                    className="pm-form-select"
                    required
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                  {registerErrors.sex && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{registerErrors.sex}</span>
                  )}
                </div>

                <div className="pm-form-field">
                  <label className="pm-field-label">
                    Middle Name <span className="optional">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={registerForm.middleName}
                    onChange={(e) => setRegisterForm({ ...registerForm, middleName: e.target.value })}
                    placeholder="Enter middle name"
                    className="pm-form-input"
                  />
                </div>

                <div className="pm-form-field">
                  <label className="pm-field-label">Contact Number</label>
                  <input
                    type="text"
                    value={registerForm.contactNumber}
                    onChange={(e) => setRegisterForm({ ...registerForm, contactNumber: e.target.value })}
                    placeholder="Enter contact number"
                    className="pm-form-input"
                  />
                </div>

                <div className="pm-form-field">
                  <label className="pm-field-label">
                    Last Name <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    value={registerForm.lastName}
                    onChange={(e) => setRegisterForm({ ...registerForm, lastName: e.target.value })}
                    placeholder="Enter last name"
                    className="pm-form-input"
                    required
                  />
                  {registerErrors.lastName && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{registerErrors.lastName}</span>
                  )}
                </div>

                <div className="pm-form-field">
                  <label className="pm-field-label">
                    Status (Visit Type) <span className="req">*</span>
                  </label>
                  <select
                    value={registerForm.type || 'Checkup'}
                    onChange={(e) => setRegisterForm({ ...registerForm, type: e.target.value })}
                    className="pm-form-select"
                  >
                    <option value="Checkup">Checkup</option>
                    <option value="Follow up">Follow up</option>
                    <option value="Consultation">Consultation</option>
                  </select>
                </div>

                <div className="pm-form-field full-width">
                  <label className="pm-field-label">
                    Address <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    value={registerForm.address}
                    onChange={(e) => setRegisterForm({ ...registerForm, address: e.target.value })}
                    placeholder="Enter Address"
                    className="pm-form-input"
                    required
                  />
                  {registerErrors.address && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{registerErrors.address}</span>
                  )}
                </div>
              </div>

              {/* SECTION 2: Emergency Contact Information */}
              <h3 className="pm-form-section-title">Emergency Contact Information</h3>

              <div className="pm-form-grid-2">
                <div className="pm-form-field">
                  <label className="pm-field-label">
                    First Name <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    value={registerForm.emergFirstName}
                    onChange={(e) => setRegisterForm({ ...registerForm, emergFirstName: e.target.value })}
                    placeholder="Enter first name"
                    className="pm-form-input"
                  />
                </div>

                <div className="pm-form-field">
                  <label className="pm-field-label">Contact Number</label>
                  <input
                    type="text"
                    value={registerForm.emergContactNumber}
                    onChange={(e) => setRegisterForm({ ...registerForm, emergContactNumber: e.target.value })}
                    placeholder="Enter Contact Number"
                    className="pm-form-input"
                  />
                </div>

                <div className="pm-form-field">
                  <label className="pm-field-label">
                    Middle Name <span className="optional">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={registerForm.emergMiddleName}
                    onChange={(e) => setRegisterForm({ ...registerForm, emergMiddleName: e.target.value })}
                    placeholder="Enter middle name"
                    className="pm-form-input"
                  />
                </div>

                <div></div>

                <div className="pm-form-field">
                  <label className="pm-field-label">
                    Last Name <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    value={registerForm.emergLastName}
                    onChange={(e) => setRegisterForm({ ...registerForm, emergLastName: e.target.value })}
                    placeholder="Enter last name"
                    className="pm-form-input"
                  />
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="pm-modal-footer">
                <button
                  type="button"
                  className="pm-btn-cancel"
                  onClick={() => setShowRegisterModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="pm-btn-save">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          CHECKLIST / ROSTER MODAL
          ========================================================================= */}
      {showRecordsModal && (
        <div className="modal-backdrop-clean animate-fade" onClick={() => setShowRecordsModal(false)}>
          <div className="modal-dialog-clean animate-zoom" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>Patient List Roster</h3>
              <button type="button" className="close-x" onClick={() => setShowRecordsModal(false)}>×</button>
            </div>
            <div className="patient-roster-stack">
              {patients.map((item, idx) => (
                <div key={idx} className="roster-row" onClick={() => { handleSelectPatient(item); setShowRecordsModal(false); }}>
                  <div className="roster-initial">{item.name.charAt(0)}</div>
                  <div className="roster-info">
                    <strong>{item.name}</strong>
                    <span>{item.type} • {item.doctor}</span>
                  </div>
                  <span className="roster-time-tag">{item.id}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SIGN OUT CONFIRMATION MODAL
          ========================================================================= */}
      {showLogoutConfirm && (
        <div className="modal-backdrop-clean animate-fade" onClick={() => setShowLogoutConfirm(false)}>
          <div className="modal-dialog-clean logout-modal-clean animate-zoom" onClick={(e) => e.stopPropagation()}>
            <div className="logout-ring-icon">
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                <line x1="12" y1="2" x2="12" y2="12" />
              </svg>
            </div>
            <h3 style={{ margin: '10px 0 4px', fontSize: '1.25rem' }}>Sign Out of MedVault?</h3>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748B' }}>
              You will return directly to the login portal.
            </p>
            <div className="modal-btn-row" style={{ justifyContent: 'center', marginTop: '20px' }}>
              <button type="button" className="modal-btn-ghost" onClick={() => setShowLogoutConfirm(false)}>Stay</button>
              <button
                type="button"
                className="modal-btn-danger"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  if (onLogout) onLogout();
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="pm-toast animate-pop-in">
          <span className="pm-toast-icon">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
