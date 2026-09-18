import React, { useState } from 'react';
import './patientsModuleReceptionist.css';

export default function PatientsModuleReceptionist({
  onNavigate,
  onLogout,
  patients: propPatients,
  setPatients: propSetPatients,
}) {
  // Shared or Local Patients State
  const defaultPatients = [
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
  ];

  const [localPatients, setLocalPatients] = useState(defaultPatients);
  const patients = propPatients || localPatients;
  const setPatients = propSetPatients || setLocalPatients;

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modals & Drawers
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Register Form State (Pic 3 Exact Match)
  const [formData, setFormData] = useState({
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

  const [formErrors, setFormErrors] = useState({});

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 3200);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleRegisterSubmit = (e) => {
    e.preventDefault();
    const errors = {};

    if (!formData.firstName.trim()) errors.firstName = 'First name is required';
    if (!formData.lastName.trim()) errors.lastName = 'Last name is required';
    if (!formData.sex) errors.sex = 'Please select sex';
    if (!formData.address.trim()) errors.address = 'Address is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    // Generate new patient ID
    const nextNum = patients.length + 1;
    const formattedId = `PTNT-${String(nextNum).padStart(3, '0')}`;

    const fullName = `${formData.firstName} ${formData.middleName ? formData.middleName + ' ' : ''}${formData.lastName}`.trim();
    const emergFullName = `${formData.emergFirstName} ${formData.emergLastName}`.trim();

    const newPatientObj = {
      id: formattedId,
      name: fullName,
      age: 28, // Default age or prompt
      status: 'Waiting',
      sex: formData.sex,
      contact: formData.contactNumber || 'N/A',
      address: formData.address,
      emergencyName: emergFullName || 'N/A',
      emergencyContact: formData.emergContactNumber || 'N/A',
      doctor: 'Dr. Santos',
    };

    setPatients((prev) => [newPatientObj, ...prev]);
    setShowRegisterModal(false);
    showToast(`Patient ${fullName} (${formattedId}) registered successfully!`);

    // Reset Form
    setFormData({
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

  // Filtered Patients List
  const filteredPatients = patients.filter((p) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(query) ||
      p.id.toLowerCase().includes(query) ||
      p.status.toLowerCase().includes(query) ||
      (p.doctor && p.doctor.toLowerCase().includes(query));

    const matchesStatus =
      statusFilter === 'All' ||
      p.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="pm-page-container">
      {/* =========================================================================
          LEFT SIDEBAR (1:1 with Pic 2)
          ========================================================================= */}
      <aside className="pm-sidebar">
        {/* Brand Red Cross */}
        <div className="pm-sidebar-brand">
          <div className="pm-brand-cross-box" title="MedVault Care">
            <svg viewBox="0 0 24 24" width="34" height="34" fill="#FF5252">
              <path d="M19 10.5h-5.5V5c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v5.5H5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5h5.5V19c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-5.5H19c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5z" />
            </svg>
          </div>
        </div>

        {/* 3-Button Pill Navigation (Matches Pic 2) */}
        <nav className="pm-nav-pill-container" aria-label="Main Navigation">
          {/* 1. Home / Dashboard */}
          <button
            type="button"
            className="pm-nav-btn"
            onClick={() => onNavigate && onNavigate('dashboard')}
            title="Dashboard"
            aria-label="Dashboard"
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
            </svg>
          </button>

          {/* 2. Patients Module (ACTIVE) */}
          <button
            type="button"
            className="pm-nav-btn active"
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

          {/* 3. Clinical Checklist / Records */}
          <button
            type="button"
            className="pm-nav-btn"
            onClick={() => onNavigate && onNavigate('dashboard')}
            title="Records & Checklist"
            aria-label="Records & Checklist"
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
        <div className="pm-sidebar-footer">
          <button
            type="button"
            className="pm-power-btn"
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
          MAIN WORKSPACE (1:1 with Pic 2)
          ========================================================================= */}
      <main className="pm-workspace">
        {/* TOP HEADER */}
        <header className="pm-header">
          <h1 className="pm-main-title">Patients Module</h1>

          <div className="pm-header-tools">
            {/* Search Pill */}
            <div className="pm-search-pill-container">
              <svg className="pm-search-glass-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#00ADEF" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder=""
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pm-search-pill-input"
                aria-label="Search patients"
              />
            </div>

            {/* Status Filter Pill Dropdown */}
            <div className="pm-filter-select-wrapper">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pm-status-select"
                aria-label="Filter by status"
              >
                <option value="All">Status</option>
                <option value="Waiting">Waiting</option>
                <option value="In Room">In Room</option>
                <option value="Done">Done</option>
              </select>
              <span className="pm-select-caret">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>

            {/* + Register a Patient Button */}
            <button
              type="button"
              className="pm-register-btn"
              onClick={() => setShowRegisterModal(true)}
              title="Register a new patient"
            >
              + Register a Patient
            </button>

            {/* Notification Bell */}
            <button
              type="button"
              className="pm-header-icon-btn"
              onClick={() => setShowNotifications(!showNotifications)}
              title="Notifications"
              aria-label="Notifications"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="#00ADEF">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
              </svg>
              <span className="pm-notif-badge"></span>
            </button>

            {/* Avatar Pill */}
            <div className="pm-header-avatar" title="Receptionist Account">
              <span>A</span>
            </div>
          </div>
        </header>

        {/* MAIN CARD: Patient Information Table */}
        <section className="pm-main-card">
          <h2 className="pm-card-title">Patient Information</h2>

          <div className="pm-table-wrapper">
            <table className="pm-table">
              <thead>
                <tr>
                  <th style={{ width: '20%' }}>Patient ID</th>
                  <th style={{ width: '28%' }}>Patient</th>
                  <th className="center-align" style={{ width: '12%' }}>Age</th>
                  <th className="center-align" style={{ width: '20%' }}>Status</th>
                  <th className="center-align" style={{ width: '20%' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.length > 0 ? (
                  filteredPatients.map((patient) => (
                    <tr key={patient.id}>
                      <td className="pm-patient-id">{patient.id}</td>
                      <td className="pm-patient-name">{patient.name}</td>
                      <td className="center-align">{patient.age}</td>
                      <td className="center-align">
                        <span
                          className={`pm-status-badge ${
                            patient.status.toLowerCase() === 'waiting'
                              ? 'pm-status-waiting'
                              : patient.status.toLowerCase() === 'in room'
                              ? 'pm-status-in-room'
                              : 'pm-status-done'
                          }`}
                        >
                          {patient.status}
                        </span>
                      </td>
                      <td className="center-align">
                        <button
                          type="button"
                          className="pm-action-btn"
                          onClick={() => setSelectedPatient(patient)}
                          title={`View details for ${patient.name}`}
                        >
                          View Info
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="pm-empty-row">
                      No patients found matching your search or filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination: < ( 1 ) > */}
          <div className="pm-pagination-bar">
            <button type="button" className="pm-pagination-caret" disabled aria-label="Previous page">
              ‹
            </button>
            <button type="button" className="pm-pagination-num" aria-label="Page 1">
              1
            </button>
            <button type="button" className="pm-pagination-caret" disabled aria-label="Next page">
              ›
            </button>
          </div>
        </section>
      </main>

      {/* =========================================================================
          PIC 3: REGISTER PATIENT MODAL (1:1 Match)
          ========================================================================= */}
      {showRegisterModal && (
        <div className="pm-modal-backdrop" onClick={() => setShowRegisterModal(false)}>
          <div className="pm-modal-card" onClick={(e) => e.stopPropagation()}>
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
                {/* Row 1: First Name * & Sex* */}
                <div className="pm-form-field">
                  <label className="pm-field-label">
                    First Name <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    placeholder="Enter first name"
                    className="pm-form-input"
                    required
                  />
                  {formErrors.firstName && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{formErrors.firstName}</span>
                  )}
                </div>

                <div className="pm-form-field">
                  <label className="pm-field-label">
                    Sex<span className="req">*</span>
                  </label>
                  <select
                    name="sex"
                    value={formData.sex}
                    onChange={handleInputChange}
                    className="pm-form-select"
                    required
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                  {formErrors.sex && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{formErrors.sex}</span>
                  )}
                </div>

                {/* Row 2: Middle Name (Optional) & Contact Number */}
                <div className="pm-form-field">
                  <label className="pm-field-label">
                    Middle Name <span className="optional">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    name="middleName"
                    value={formData.middleName}
                    onChange={handleInputChange}
                    placeholder="Enter middle name"
                    className="pm-form-input"
                  />
                </div>

                <div className="pm-form-field">
                  <label className="pm-field-label">Contact Number</label>
                  <input
                    type="text"
                    name="contactNumber"
                    value={formData.contactNumber}
                    onChange={handleInputChange}
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
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    placeholder="Enter last name"
                    className="pm-form-input"
                    required
                  />
                  {formErrors.lastName && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{formErrors.lastName}</span>
                  )}
                </div>

                {/* Row 4: Address * (Full width) */}
                <div className="pm-form-field full-width">
                  <label className="pm-field-label">
                    Address <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Enter Address"
                    className="pm-form-input"
                    required
                  />
                  {formErrors.address && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{formErrors.address}</span>
                  )}
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
                    name="emergFirstName"
                    value={formData.emergFirstName}
                    onChange={handleInputChange}
                    placeholder="Enter first name"
                    className="pm-form-input"
                  />
                </div>

                <div className="pm-form-field">
                  <label className="pm-field-label">Contact Number</label>
                  <input
                    type="text"
                    name="emergContactNumber"
                    value={formData.emergContactNumber}
                    onChange={handleInputChange}
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
                    name="emergMiddleName"
                    value={formData.emergMiddleName}
                    onChange={handleInputChange}
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
                    name="emergLastName"
                    value={formData.emergLastName}
                    onChange={handleInputChange}
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
          PATIENT DETAIL MODAL (View Info Action)
          ========================================================================= */}
      {selectedPatient && (
        <div className="pm-modal-backdrop" onClick={() => setSelectedPatient(null)}>
          <div className="pm-modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="pm-modal-close-btn"
              onClick={() => setSelectedPatient(null)}
              aria-label="Close details"
            >
              ✕
            </button>

            <h2 className="pm-modal-title">Patient Profile</h2>

            <div className="pm-detail-info-grid">
              <div className="pm-detail-item">
                <span className="pm-detail-label">Patient ID</span>
                <span className="pm-detail-val" style={{ color: '#00ADEF' }}>{selectedPatient.id}</span>
              </div>
              <div className="pm-detail-item">
                <span className="pm-detail-label">Full Name</span>
                <span className="pm-detail-val">{selectedPatient.name}</span>
              </div>
              <div className="pm-detail-item">
                <span className="pm-detail-label">Age / Sex</span>
                <span className="pm-detail-val">{selectedPatient.age} yrs • {selectedPatient.sex || 'Not specified'}</span>
              </div>
              <div className="pm-detail-item">
                <span className="pm-detail-label">Current Status</span>
                <span
                  className={`pm-status-badge ${
                    selectedPatient.status.toLowerCase() === 'waiting'
                      ? 'pm-status-waiting'
                      : selectedPatient.status.toLowerCase() === 'in room'
                      ? 'pm-status-in-room'
                      : 'pm-status-done'
                  }`}
                  style={{ width: 'fit-content' }}
                >
                  {selectedPatient.status}
                </span>
              </div>
              <div className="pm-detail-item">
                <span className="pm-detail-label">Contact Number</span>
                <span className="pm-detail-val">{selectedPatient.contact || 'N/A'}</span>
              </div>
              <div className="pm-detail-item">
                <span className="pm-detail-label">Assigned Doctor</span>
                <span className="pm-detail-val">{selectedPatient.doctor || 'Dr. Santos'}</span>
              </div>
              <div className="pm-detail-item" style={{ gridColumn: '1 / -1' }}>
                <span className="pm-detail-label">Address</span>
                <span className="pm-detail-val">{selectedPatient.address || 'N/A'}</span>
              </div>
              <div className="pm-detail-item" style={{ gridColumn: '1 / -1' }}>
                <span className="pm-detail-label">Emergency Contact</span>
                <span className="pm-detail-val">
                  {selectedPatient.emergencyName || 'N/A'} ({selectedPatient.emergencyContact || 'N/A'})
                </span>
              </div>
            </div>

            {/* Quick Status Update */}
            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#475569' }}>Change Status:</span>
              {['Waiting', 'In Room', 'Done'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setPatients((prev) =>
                      prev.map((p) => (p.id === selectedPatient.id ? { ...p, status: st } : p))
                    );
                    setSelectedPatient((prev) => ({ ...prev, status: st }));
                    showToast(`Updated ${selectedPatient.name} to ${st}`);
                  }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: '1.5px solid #00ADEF',
                    background: selectedPatient.status === st ? '#00ADEF' : '#ffffff',
                    color: selectedPatient.status === st ? '#ffffff' : '#00ADEF',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="pm-modal-footer">
              <button
                type="button"
                className="pm-btn-save"
                onClick={() => setSelectedPatient(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SIGN OUT CONFIRMATION MODAL
          ========================================================================= */}
      {showLogoutConfirm && (
        <div className="pm-modal-backdrop" onClick={() => setShowLogoutConfirm(false)}>
          <div className="pm-modal-card" style={{ maxWidth: '420px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                <line x1="12" y1="2" x2="12" y2="12" />
              </svg>
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 8px 0' }}>Sign Out</h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 24px 0' }}>
              Are you sure you want to sign out of your session?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button
                type="button"
                className="pm-btn-cancel"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pm-btn-save"
                style={{ background: '#ef4444' }}
                onClick={() => {
                  setShowLogoutConfirm(false);
                  if (onLogout) onLogout();
                }}
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="pm-toast">
          <span className="pm-toast-icon">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
