import React, { useState } from 'react';
import './receptionistDashboard.css';
import './patientsModuleReceptionist.css';
import { createRecordId, dateKey, hasBooking, scheduleKey, slotsBetween, timeKey, todayISO } from './medsecData';

export default function ReceptionistDashboard({
  onLogout,
  receptionistName = 'Receptionist',
  onNavigate,
  patients,
  setPatients,
  appointments = [],
  setAppointments,
  schedules = {},
  role = 'Receptionist',
}) {
  const nurseName = receptionistName || role;
  const isMedicalSecretary = role === 'Medical Secretary';
  const [activeNav, setActiveNav] = useState('home'); // 'home' | 'patients' | 'records'
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'register' | 'appointment' | 'patientList' | 'patientDetail' | null
  const [selectedPatient, setSelectedPatient] = useState(null);
  const dashboardDate = new Date();
  const [appointmentError, setAppointmentError] = useState('');

  const closeModal = () => {
    setActiveModal(null);
    setActiveNav('home');
    setAppointmentError('');
  };

  // Pic 3 Register Form State
  const [registerFormData, setRegisterFormData] = useState({
    firstName: '',
    sex: '',
    middleName: '',
    contactNumber: '',
    lastName: '',
    address: '',
    emergFirstName: '',
    emergContactNumber: '',
    emergMiddleName: '',
    emergLastName: '',
  });

  // Range Toggle State: 'Weekly' | 'Quarterly' | 'Annually'
  const [chartRange, setChartRange] = useState('Weekly');

  // Activity comes from the same appointments shown in both modules.
  const bookedAppointments = appointments.filter((item) => item.patientId && !['Open', 'Cancelled'].includes(item.status));
  const weekStart = new Date(dashboardDate.getFullYear(), dashboardDate.getMonth(), dashboardDate.getDate(), 12);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const chartDatasets = {
    Weekly: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, index) => {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + index);
      return { label, count: bookedAppointments.filter((item) => dateKey(item.date) === dateKey(day)).length };
    }),
    Quarterly: [1, 2, 3, 4].map((quarter) => ({
      label: `Q${quarter}`,
      count: bookedAppointments.filter((item) => {
        const key = dateKey(item.date);
        return Number(key.slice(0, 4)) === dashboardDate.getFullYear() &&
          Math.floor((Number(key.slice(5, 7)) - 1) / 3) + 1 === quarter;
      }).length,
    })),
    Annually: Array.from({ length: 4 }, (_, index) => dashboardDate.getFullYear() - 3 + index).map((year) => ({
      label: String(year), count: bookedAppointments.filter((item) => Number(dateKey(item.date).slice(0, 4)) === year).length,
    })),
  };

  const currentChartData = chartDatasets[chartRange] || chartDatasets.Weekly;
  const chartMaximum = Math.max(10, Math.ceil(Math.max(...currentChartData.map((item) => item.count)) / 10) * 10);
  const chartTicks = [1, 0.7, 0.5, 0.25, 0.1, 0].map((fraction) =>
    Math.round(chartMaximum * fraction)
  );

  const handleCardKeyDown = (event, action) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };

  const todayKey = todayISO();
  const sharedAppointments = appointments
    .filter((item) => item.patientId && !['Open', 'Cancelled'].includes(item.status))
    .map((item) => ({
      id: item.id, time: item.time, patient: item.patientName || 'Patient', type: item.type,
      doctor: item.doctor, status: item.visitStatus || (item.status === 'Completed' ? 'Completed' : 'Waiting'),
      date: item.date, bp: patients?.find((patient) => patient.id === item.patientId)?.vitals?.bp || '—',
      hr: patients?.find((patient) => patient.id === item.patientId)?.vitals?.hr || '—',
    }));
  const dashboardToday = sharedAppointments.filter((item) => dateKey(item.date) === todayKey);
  const dashboardUpcoming = sharedAppointments.filter((item) => dateKey(item.date) > todayKey && item.status !== 'Completed');

  // Filtering
  const filteredToday = dashboardToday.filter((app) => {
    const matchesSearch = app.patient.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          app.doctor.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          app.type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === 'All' || app.status.toLowerCase() === activeFilter.toLowerCase();
    return matchesSearch && matchesFilter;
  });

  const filteredUpcoming = dashboardUpcoming.filter((app) =>
    app.patient.toLowerCase().includes(searchQuery.toLowerCase()) ||
    app.time.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRegisterPatient = (e) => {
    e.preventDefault();
    const fullName = `${registerFormData.firstName} ${registerFormData.middleName ? registerFormData.middleName + ' ' : ''}${registerFormData.lastName}`.trim();
    if (!fullName) return;

    if (setPatients) {
      const newPatientObj = {
        id: createRecordId('PTNT'),
        name: fullName,
        age: '',
        status: 'Waiting',
        sex: registerFormData.sex || '',
        contact: registerFormData.contactNumber || '',
        address: registerFormData.address || '',
        emergencyName: `${registerFormData.emergFirstName} ${registerFormData.emergLastName}`.trim(),
        emergencyContact: registerFormData.emergContactNumber || '',
        doctor: '',
        date: todayKey,
        vitals: {}, medical: {}, appointments: [],
        createdAt: new Date().toISOString(),
      };
      setPatients((prev) => [newPatientObj, ...prev]);
    }

    setActiveModal(null);
    setRegisterFormData({
      firstName: '',
      sex: '',
      middleName: '',
      contactNumber: '',
      lastName: '',
      address: '',
      emergFirstName: '',
      emergContactNumber: '',
      emergMiddleName: '',
      emergLastName: '',
    });
  };

  const handleDashboardAppointment = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const patient = patients?.find((item) => item.id === form.get('patientId'));
    if (!patient || !setAppointments) return;
    const date = String(form.get('date'));
    const time = String(form.get('time'));
    const doctor = String(form.get('doctor'));
    const savedSchedule = schedules[scheduleKey(doctor, date)];
    if (hasBooking(appointments, doctor, date, time) ||
      (savedSchedule && (!slotsBetween(savedSchedule.start, savedSchedule.end).includes(timeKey(time)) || savedSchedule.blocked?.[timeKey(time)]))) {
      setAppointmentError('This time is already booked or blocked in Doctor Schedules.'); return;
    }
    const booking = {
      id: createRecordId('APPT'), patientId: patient.id, patientName: patient.name,
      age: patient.age, sex: patient.sex, contact: patient.contact, address: patient.address,
      emergencyName: patient.emergencyName, emergencyContact: patient.emergencyContact,
      doctor, date, time, type: String(form.get('type')), status: 'Confirmed', visitStatus: 'Waiting',
      notes: 'Appointment booked by Receptionist.',
    };
    setAppointments((current) => [booking, ...current]);
    setPatients?.((current) => current.map((item) => item.id === patient.id ? {
      ...item, appointments: [{ sourceAppointmentId: booking.id, date, doctor, type: booking.type, status: 'Scheduled' }, ...(item.appointments || [])],
    } : item));
    setAppointmentError('');
    closeModal();
  };

  return (
    <div className="nd-screen-container">
      <div className="nd-dashboard-frame">
        {/* =========================================================================
            FAR LEFT SIDEBAR (Matches Pic 2 1:1)
            ========================================================================= */}
        <aside className="nd-sidebar">
        {/* Top Medical Red Cross */}
        <div className="nd-sidebar-logo" title="MedVault Care">
          <svg viewBox="0 0 46 46" width="46" height="46" fill="none">
            <rect x="17" y="3" width="12" height="40" rx="6" fill="#FF4D4D" />
            <rect x="3" y="17" width="40" height="12" rx="6" fill="#FF4D4D" />
          </svg>
        </div>

        {/* Floating Capsule Menu (Squircle Buttons - 3 buttons matching Pic 2) */}
        <nav className="nd-sidebar-nav">
          {/* 1. Home Button (Squircle) */}
          <button
            type="button"
            className={`nav-btn ${activeNav === 'home' ? 'active' : ''}`}
            onClick={() => {
              setActiveNav('home');
              if (onNavigate) onNavigate('dashboard');
            }}
            title="Dashboard"
            aria-label="Dashboard"
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
            </svg>
          </button>

          {/* 2. Patients Module Button (Squircle - navigates to Patients Module) */}
          <button
            type="button"
            className={`nav-btn ${activeNav === 'patients' ? 'active' : ''}`}
            onClick={() => {
              setActiveNav('patients');
              if (onNavigate) onNavigate('patients');
            }}
            title={isMedicalSecretary ? 'Patient Records' : 'Patients Module'}
            aria-label={isMedicalSecretary ? 'Patient Records' : 'Patients Module'}
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
              <circle cx="10" cy="8" r="4" fill={activeNav === 'patients' ? '#ffffff' : '#00ADEF'} />
              <path d="M2 18c0-3.3 3.6-6 8-6s8 2.7 8 6v1H2v-1z" fill={activeNav === 'patients' ? '#ffffff' : '#00ADEF'} />
              <circle cx="18" cy="17" r="4.5" fill={activeNav === 'patients' ? '#ffffff' : '#00ADEF'} />
              <path d="M18 15v4M16 17h4" stroke={activeNav === 'patients' ? '#00ADEF' : '#ffffff'} strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          {/* 3. Appointments Module Button */}
          <button
            type="button"
            className={`nav-btn ${activeNav === 'appointments' ? 'active' : ''}`}
            onClick={() => {
              setActiveNav('appointments');
              if (onNavigate) onNavigate('appointments');
            }}
            title="Appointments Module"
            aria-label="Appointments Module"
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
              <rect x="4" y="5" width="13" height="16" rx="2" fill={activeNav === 'appointments' ? '#ffffff' : '#00ADEF'} />
              <rect x="7" y="3" width="7" height="3" rx="1.5" fill={activeNav === 'appointments' ? '#ffffff' : '#00ADEF'} />
              <path d="M7 10h5M7 13h5M7 16h3" stroke={activeNav === 'appointments' ? '#00ADEF' : '#ffffff'} strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="17.5" cy="16.5" r="3.5" fill={activeNav === 'appointments' ? '#00ADEF' : '#ffffff'} stroke={activeNav === 'appointments' ? '#ffffff' : '#00ADEF'} strokeWidth="2" />
              <line x1="20" y1="19" x2="22.5" y2="21.5" stroke={activeNav === 'appointments' ? '#ffffff' : '#00ADEF'} strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
          {isMedicalSecretary && <button type="button" className="nav-btn" onClick={() => onNavigate?.('schedules')}
            title="Doctor Schedules" aria-label="Doctor Schedules">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
              <rect x="3" y="4" width="18" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M3 9h18M8 2v4M16 2v4" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="15" r="3" />
            </svg>
          </button>}
        </nav>

        {/* Bottom Floating Power Button (Squircle - 1:1 with 2nd Pic) */}
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
          MAIN WORKSPACE (Centered, Compact, Balanced 1:1 Proportions)
          ========================================================================= */}
      <main className="nd-workspace">
        {/* TOP HEADER */}
        <header className="nd-header">
          <div className="header-titles">
            <span className="welcome-receptionist-text">Welcome Back, {role}</span>
            <h1 className="dashboard-main-title">Dashboard</h1>
          </div>

          <div className="header-right-tools">
            {/* Search Pill */}
            <div className="search-pill-container">
              <svg className="search-glass-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#00ADEF" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder=""
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-pill-input"
              />
            </div>

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
                    <strong>Abigail Yatco</strong> finished consultation with Dr. Rebucayo.
                  </div>
                  <div className="notif-row">
                    <strong>Ken Ty</strong> check-in confirmed for 9:45 am.
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
                title={nurseName}
                aria-label="Profile"
              >
                <span>{isMedicalSecretary ? 'M' : 'A'}</span>
              </button>

              {showProfileMenu && (
                <div className="avatar-dropdown animate-pop-in">
                  <div className="avatar-nurse-name">{nurseName}</div>
                  <div className="avatar-duty-tag">● On Duty</div>
                  <button type="button" className="menu-signout-btn" onClick={() => setShowLogoutConfirm(true)}>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* =========================================================================
            ROW 1: 2x2 KPI CARDS (Left) + WEEKLY BAR CHART WITH TOGGLE (Right)
            ========================================================================= */}
        <section className="nd-row-top">
          {/* 2x2 KPI Cards Grid */}
          <div className="kpi-quad-grid">
            {/* Card 1: Waiting Patients */}
            <div
              className={`kpi-card ${activeFilter === 'Waiting' ? 'kpi-active' : ''}`}
              onClick={() => setActiveFilter(activeFilter === 'Waiting' ? 'All' : 'Waiting')}
              onKeyDown={(event) => handleCardKeyDown(event, () => setActiveFilter(activeFilter === 'Waiting' ? 'All' : 'Waiting'))}
              role="button"
              tabIndex={0}
              title="Filter Waiting Patients"
            >
              <div className="kpi-texts">
                <span className="kpi-heading">Waiting Patients</span>
                <span className="kpi-digit">{dashboardToday.filter((item) => item.status === 'Waiting').length}</span>
              </div>
              <div className="kpi-symbol purple-people-icon">
                <svg viewBox="0 0 24 24" width="30" height="30" fill="#5B67F1">
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                </svg>
              </div>
            </div>

            {/* Card 2: Completed Today */}
            <div
              className={`kpi-card ${activeFilter === 'Completed' ? 'kpi-active' : ''}`}
              onClick={() => setActiveFilter(activeFilter === 'Completed' ? 'All' : 'Completed')}
              onKeyDown={(event) => handleCardKeyDown(event, () => setActiveFilter(activeFilter === 'Completed' ? 'All' : 'Completed'))}
              role="button"
              tabIndex={0}
              title="Filter Completed Today"
            >
              <div className="kpi-texts">
                <span className="kpi-heading">{isMedicalSecretary ? 'Completed Patients' : 'Completed Today'}</span>
                <span className="kpi-digit">{dashboardToday.filter((item) => item.status === 'Completed').length}</span>
              </div>
              <div className="kpi-symbol orange-check-icon">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#F97316" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  <path d="M9 13l2 2 4-4" />
                </svg>
              </div>
            </div>

            {/* Card 3: Today's Appointments */}
            <div
              className={`kpi-card ${activeFilter === 'All' ? 'kpi-active' : ''}`}
              onClick={() => setActiveFilter('All')}
              onKeyDown={(event) => handleCardKeyDown(event, () => setActiveFilter('All'))}
              role="button"
              tabIndex={0}
              title="Show All Appointments"
            >
              <div className="kpi-texts">
                <span className="kpi-heading">Today's Appointments</span>
                <span className="kpi-digit">{dashboardToday.length}</span>
              </div>
              <div className="kpi-symbol pink-user-icon">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="#C084FC">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
            </div>

            {/* Card 4: New Patients Today */}
            <div
              className="kpi-card"
              onClick={() => setActiveModal('register')}
              onKeyDown={(event) => handleCardKeyDown(event, () => setActiveModal('register'))}
              role="button"
              tabIndex={0}
              title="Register New Patient"
            >
              <div className="kpi-texts">
                <span className="kpi-heading">New Patients Today</span>
                <span className="kpi-digit">{(patients || []).filter((patient) => patient.createdAt && dateKey(patient.createdAt) === todayKey).length}</span>
              </div>
              <div className="kpi-symbol red-target-icon">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="10" r="3" />
                  <path d="M6.168 18.849a4 4 0 0 1 3.832-2.849h4a4 4 0 0 1 3.834 2.855" />
                  <path d="M19 5l2 2" />
                </svg>
              </div>
            </div>
          </div>

          {/* Weekly Activity Bar Chart with Range Buttons (1:1 with Pic 1) */}
          <div className="nd-chart-card">
            {/* Top Range Toggle Pill (Weekly / Quarterly / Annually) */}
            <div className="chart-card-top-bar">
              <div className="chart-range-pill" role="tablist">
                <button
                  type="button"
                  className={`range-tab-btn ${chartRange === 'Weekly' ? 'active' : ''}`}
                  onClick={() => setChartRange('Weekly')}
                  role="tab"
                  aria-selected={chartRange === 'Weekly'}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  className={`range-tab-btn ${chartRange === 'Quarterly' ? 'active' : ''}`}
                  onClick={() => setChartRange('Quarterly')}
                  role="tab"
                  aria-selected={chartRange === 'Quarterly'}
                >
                  Quarterly
                </button>
                <button
                  type="button"
                  className={`range-tab-btn ${chartRange === 'Annually' ? 'active' : ''}`}
                  onClick={() => setChartRange('Annually')}
                  role="tab"
                  aria-selected={chartRange === 'Annually'}
                >
                  Annually
                </button>
              </div>
            </div>

            {/* Chart Area */}
            <div className="chart-wrapper-exact">
              {/* Y-Axis numbers: 100, 70, 50, 25, 10, 0 */}
              <div className="exact-y-axis">
                {chartTicks.map((tick) => <span key={tick}>{tick}</span>)}
              </div>

              {/* Bars & Grid lines */}
              <div className="exact-chart-canvas">
                <div className="grid-horizontal-lines">
                  <div className="h-line" style={{ bottom: '100%' }}></div>
                  <div className="h-line" style={{ bottom: '70%' }}></div>
                  <div className="h-line" style={{ bottom: '50%' }}></div>
                  <div className="h-line" style={{ bottom: '25%' }}></div>
                  <div className="h-line" style={{ bottom: '10%' }}></div>
                  <div className="h-line" style={{ bottom: '0%' }}></div>
                </div>

                <div className="bars-flex-container">
                  {currentChartData.map((item) => (
                    <div key={item.label} className="exact-bar-column">
                      <div className="bar-vertical-track">
                        <div
                          className="exact-cyan-bar animate-grow-bar"
                          style={{ height: `${(item.count / chartMaximum) * 100}%` }}
                          data-tooltip={`${item.count} Patients`}
                          aria-label={`${item.label}: ${item.count} patients`}
                        ></div>
                      </div>
                      <span className="day-x-label">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            ROW 2: TODAY'S APPOINTMENTS (Left) + UPCOMING APPOINTMENTS (Right)
            ========================================================================= */}
        <section className="nd-row-tables">
          {/* Today's Appointments Table Card */}
          <div className="nd-table-card today-table-card">
            <h2 className="card-table-title">Today's Appointments</h2>
            <div className="table-flow-container">
              <table className="exact-nd-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center', width: '18%' }}>Time</th>
                    <th style={{ textAlign: 'center', width: '24%' }}>Patient</th>
                    <th style={{ textAlign: 'center', width: '20%' }}>Type</th>
                    <th style={{ textAlign: 'center', width: '20%' }}>Doctor</th>
                    <th style={{ textAlign: 'center', width: '18%' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredToday.map((app) => (
                    <tr
                      key={app.id}
                      className="clickable-table-row"
                      onClick={() => {
                        setSelectedPatient(app);
                        setActiveModal('patientDetail');
                      }}
                    >
                      <td style={{ textAlign: 'center' }}>{app.time}</td>
                      <td style={{ textAlign: 'center' }}>{app.patient}</td>
                      <td style={{ textAlign: 'center' }}>{app.type}</td>
                      <td style={{ textAlign: 'center' }}>{app.doctor}</td>
                      <td style={{ textAlign: 'center' }}>{app.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination: < ( 1 ) > */}
            <div className="exact-pagination">
              <span className="pagination-caret disabled">‹</span>
              <span className="pagination-circle-active">1</span>
              <span className="pagination-caret">›</span>
            </div>
          </div>

          {/* Upcoming Appointments Table Card */}
          <div className="nd-table-card upcoming-table-card">
            <h2 className="card-table-title">Upcoming Appointments</h2>
            <div className="table-flow-container">
              <table className="exact-nd-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center', width: '40%' }}>Time</th>
                    <th style={{ textAlign: 'center', width: '60%' }}>Patient</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUpcoming.map((item) => (
                    <tr
                      key={item.id}
                      className="clickable-table-row"
                      onClick={() => {
                        setSelectedPatient({ ...item, status: 'Upcoming', bp: '120/80', hr: '70 bpm' });
                        setActiveModal('patientDetail');
                      }}
                    >
                      <td style={{ textAlign: 'center' }}>{item.time}</td>
                      <td style={{ textAlign: 'center' }}>{item.patient}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination: < ( 1 ) > */}
            <div className="exact-pagination">
              <span className="pagination-caret disabled">‹</span>
              <span className="pagination-circle-active">1</span>
              <span className="pagination-caret">›</span>
            </div>
          </div>
        </section>

        {/* =========================================================================
            ROW 3: 3 ACTION BUTTON CARDS
            ========================================================================= */}
        <section className={`nd-row-actions ${isMedicalSecretary ? 'medsec-quick-actions' : ''}`}>
          {isMedicalSecretary ? (
            <>
              <button type="button" className="exact-action-card" onClick={() => onNavigate?.('patients')}>
                <div className="action-label-stack"><span>Patient</span><span>Records</span></div>
                <span className="plus-symbol purple-plus" aria-hidden="true">→</span>
              </button>
              <button type="button" className="exact-action-card" onClick={() => onNavigate?.('appointments')}>
                <div className="action-label-stack"><span>Appointments</span><span>Module</span></div>
                <span className="plus-symbol cyan-plus" aria-hidden="true">→</span>
              </button>
              <button type="button" className="exact-action-card" onClick={() => onNavigate?.('schedules')}>
                <div className="action-label-stack"><span>Doctor</span><span>Schedules</span></div>
                <span className="plus-symbol purple-plus" aria-hidden="true">→</span>
              </button>
            </>
          ) : (
            <>
          {/* 1. Register a Patient */}
          <button
            type="button"
            className="exact-action-card"
            onClick={() => setActiveModal('register')}
          >
            <div className="action-label-stack">
              <span>Register a</span>
              <span>Patient</span>
            </div>
            <span className="plus-symbol purple-plus">+</span>
          </button>

          {/* 2. Create Appointment */}
          <button
            type="button"
            className="exact-action-card"
            onClick={() => setActiveModal('appointment')}
          >
            <div className="action-label-stack">
              <span>Create</span>
              <span>Appointment</span>
            </div>
            <span className="plus-symbol cyan-plus">+</span>
          </button>

          {/* 3. Patient List */}
          <button
            type="button"
            className="exact-action-card"
            onClick={() => onNavigate ? onNavigate('patients') : setActiveModal('patientList')}
          >
            <div className="action-label-stack">
              <span>Patient List</span>
            </div>
            <div className="clipboard-icon-wrap">
              <svg viewBox="0 0 28 32" width="30" height="34" fill="none">
                <rect x="2" y="4" width="24" height="27" rx="3.5" fill="#FF4D4D" />
                <rect x="7" y="1.5" width="14" height="5" rx="2.5" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="1" />
                <rect x="6" y="10" width="16" height="3" rx="1.5" fill="#ffffff" />
                <rect x="6" y="15" width="16" height="3" rx="1.5" fill="#ffffff" />
                <rect x="6" y="20" width="16" height="3" rx="1.5" fill="#ffffff" />
                <rect x="6" y="25" width="11" height="3" rx="1.5" fill="#ffffff" />
              </svg>
            </div>
          </button>
            </>
          )}
        </section>
      </main>
    </div>

      {/* =========================================================================
          INTERACTIVE MODALS
          ========================================================================= */}

      {/* 1. Register Patient Modal (Pic 3 1:1 Match) */}
      {activeModal === 'register' && (
        <div className="pm-modal-backdrop" onClick={closeModal}>
          <div className="pm-modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="pm-modal-close-btn"
              onClick={closeModal}
              aria-label="Close modal"
            >
              ✕
            </button>

            <h2 className="pm-modal-title">Register Patient</h2>

            <form onSubmit={handleRegisterPatient} noValidate>
              {/* SECTION 1: Personal Information */}
              <h3 className="pm-form-section-title">Personal Information</h3>

              <div className="pm-form-grid-2">
                {/* Row 1: First Name * & Sex* */}
                <div className="pm-form-field">
                  <label className="pm-field-label">
                    First Name <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    value={registerFormData.firstName}
                    onChange={(e) => setRegisterFormData({ ...registerFormData, firstName: e.target.value })}
                    placeholder="Enter first name"
                    className="pm-form-input"
                    required
                  />
                </div>

                <div className="pm-form-field">
                  <label className="pm-field-label">
                    Sex<span className="req">*</span>
                  </label>
                  <select
                    value={registerFormData.sex}
                    onChange={(e) => setRegisterFormData({ ...registerFormData, sex: e.target.value })}
                    className="pm-form-select"
                    required
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Row 2: Middle Name (Optional) & Contact Number */}
                <div className="pm-form-field">
                  <label className="pm-field-label">
                    Middle Name <span className="optional">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={registerFormData.middleName}
                    onChange={(e) => setRegisterFormData({ ...registerFormData, middleName: e.target.value })}
                    placeholder="Enter middle name"
                    className="pm-form-input"
                  />
                </div>

                <div className="pm-form-field">
                  <label className="pm-field-label">Contact Number</label>
                  <input
                    type="text"
                    value={registerFormData.contactNumber}
                    onChange={(e) => setRegisterFormData({ ...registerFormData, contactNumber: e.target.value })}
                    placeholder="Enter Contact Number"
                    className="pm-form-input"
                  />
                </div>

                {/* Row 3: Last Name * */}
                <div className="pm-form-field">
                  <label className="pm-field-label">
                    Last Name <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    value={registerFormData.lastName}
                    onChange={(e) => setRegisterFormData({ ...registerFormData, lastName: e.target.value })}
                    placeholder="Enter last name"
                    className="pm-form-input"
                    required
                  />
                </div>

                {/* Row 4: Address * (Full width) */}
                <div className="pm-form-field full-width">
                  <label className="pm-field-label">
                    Address <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    value={registerFormData.address}
                    onChange={(e) => setRegisterFormData({ ...registerFormData, address: e.target.value })}
                    placeholder="Enter Address"
                    className="pm-form-input"
                    required
                  />
                </div>
              </div>

              {/* SECTION 2: Emergency Contact Information */}
              <h3 className="pm-form-section-title">Emergency Contact Information</h3>

              <div className="pm-form-grid-2">
                {/* Row 1: First Name * & Contact Number */}
                <div className="pm-form-field">
                  <label className="pm-field-label">
                    First Name <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    value={registerFormData.emergFirstName}
                    onChange={(e) => setRegisterFormData({ ...registerFormData, emergFirstName: e.target.value })}
                    placeholder="Enter first name"
                    className="pm-form-input"
                  />
                </div>

                <div className="pm-form-field">
                  <label className="pm-field-label">Contact Number</label>
                  <input
                    type="text"
                    value={registerFormData.emergContactNumber}
                    onChange={(e) => setRegisterFormData({ ...registerFormData, emergContactNumber: e.target.value })}
                    placeholder="Enter Contact Number"
                    className="pm-form-input"
                  />
                </div>

                {/* Row 2: Middle Name (Optional) */}
                <div className="pm-form-field">
                  <label className="pm-field-label">
                    Middle Name <span className="optional">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={registerFormData.emergMiddleName}
                    onChange={(e) => setRegisterFormData({ ...registerFormData, emergMiddleName: e.target.value })}
                    placeholder="Enter middle name"
                    className="pm-form-input"
                  />
                </div>

                <div></div>

                {/* Row 3: Last Name * */}
                <div className="pm-form-field">
                  <label className="pm-field-label">
                    Last Name <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    value={registerFormData.emergLastName}
                    onChange={(e) => setRegisterFormData({ ...registerFormData, emergLastName: e.target.value })}
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
                  onClick={closeModal}
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

      {/* 2. Create Appointment Modal */}
      {activeModal === 'appointment' && (
        <div className="modal-backdrop-clean animate-fade" onClick={closeModal}>
          <div className="modal-dialog-clean animate-zoom" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>Create Appointment</h3>
              <button type="button" className="close-x" onClick={closeModal}>×</button>
            </div>
            <form
              onSubmit={handleDashboardAppointment}
              className="modal-fields-stack"
            >
              <div className="field-block">
                <label>Patient</label>
                <select name="patientId" required defaultValue=""><option value="">Select patient</option>
                  {(patients || []).map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
                </select>
              </div>
              <div className="field-block-row">
                <div className="field-block"><label>Doctor</label><select name="doctor" defaultValue="Dr. Santos">
                  {['Dr. Cruz', 'Dr. Santos', 'Dr. Reyes', 'Dr. Rebuyaco'].map((doctor) => <option key={doctor}>{doctor}</option>)}
                </select></div>
                <div className="field-block"><label>Visit type</label><select name="type" defaultValue="Consultation"><option>Consultation</option><option>Checkup</option><option>Follow-up</option></select></div>
              </div>
              <div className="field-block-row">
                <div className="field-block">
                  <label>Date</label>
                  <input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
                </div>
                <div className="field-block">
                  <label>Time</label>
                  <input name="time" type="time" step="1800" defaultValue="14:00" required />
                </div>
              </div>
              {appointmentError && <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>{appointmentError}</p>}
              <div className="modal-btn-row">
                <button type="button" className="modal-btn-ghost" onClick={closeModal}>Cancel</button>
                <button type="submit" className="modal-btn-primary">Create Appointment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Patient List Modal */}
      {activeModal === 'patientList' && (
        <div className="modal-backdrop-clean animate-fade" onClick={closeModal}>
          <div className="modal-dialog-clean animate-zoom" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>Patient List Roster</h3>
              <button type="button" className="close-x" onClick={closeModal}>×</button>
            </div>
            <div className="patient-roster-stack">
              {[...dashboardToday, ...dashboardUpcoming].map((item, idx) => {
                const displayName = item.patient || item.name || 'Patient';
                return (
                  <div key={idx} className="roster-row">
                    <div className="roster-initial">{displayName.charAt(0)}</div>
                    <div className="roster-info">
                      <strong>{displayName}</strong>
                      <span>{item.type || 'Consultation'} • {item.doctor || 'Dr. Santos'}</span>
                    </div>
                    <span className="roster-time-tag">{item.time}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. Patient Detail / Vitals Modal */}
      {activeModal === 'patientDetail' && selectedPatient && (
        <div className="modal-backdrop-clean animate-fade" onClick={closeModal}>
          <div className="modal-dialog-clean animate-zoom" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>Patient Clinical Snapshot</h3>
              <button type="button" className="close-x" onClick={closeModal}>×</button>
            </div>
            <div className="patient-snapshot-box">
              <div className="snapshot-top-row">
                <div className="snapshot-avatar-circle">
                  {(selectedPatient.patient || selectedPatient.name || 'P').charAt(0)}
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.15rem' }}>
                    {selectedPatient.patient || selectedPatient.name || 'Patient'}
                  </h4>
                  <span style={{ fontSize: '0.85rem', color: '#64748B' }}>
                    {selectedPatient.type || 'Consultation'} with {selectedPatient.doctor || 'Dr. Santos'}
                  </span>
                </div>
              </div>
              <div className="vitals-two-col">
                <div className="v-card">
                  <span className="v-label">Blood Pressure</span>
                  <span className="v-num">{selectedPatient.bp || '120/80'}</span>
                </div>
                <div className="v-card">
                  <span className="v-label">Heart Rate</span>
                  <span className="v-num">{selectedPatient.hr || '72 bpm'}</span>
                </div>
                <div className="v-card">
                  <span className="v-label">Scheduled Time</span>
                  <span className="v-num">{selectedPatient.time}</span>
                </div>
                <div className="v-card">
                  <span className="v-label">Status</span>
                  <span className="v-num" style={{ color: '#00ADEF' }}>{selectedPatient.status}</span>
                </div>
              </div>
            </div>
            <div className="modal-btn-row">
              <button type="button" className="modal-btn-primary" onClick={closeModal}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Logout Confirmation Modal */}
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
    </div>
  );
}
