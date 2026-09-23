import React, { useState, useEffect } from 'react';
import './receptionistDashboard.css';
import './appointment.css';

export default function Appointment({
  onNavigate,
  onLogout,
  patients = [],
  setPatients: _setPatients,
}) {
  // Available schedule dates for interactive date navigation
  const availableDates = [
    'Sept 18, 2026',
    'Sept 19, 2026',
    'Sept 20, 2026',
    'Sept 21, 2026',
    'Sept 22, 2026',
  ];
  const [currentDateIndex, setCurrentDateIndex] = useState(1); // Default to Sept 19, 2026
  const currentDate = availableDates[currentDateIndex];

  // Seed Appointments matching clinical workflow
  const initialAppointments = [
    {
      id: 'APPT-101',
      time: '08:30 AM',
      patientId: 'PTNT-005',
      patientName: 'John Doe',
      age: 42,
      sex: 'Male',
      contact: '0917-111-2233',
      address: '12 Acacia St., Quezon City',
      emergencyName: 'Jane Doe',
      emergencyContact: '0917-222-3344',
      type: 'Routine Checkup',
      doctor: 'Dr. Cruz',
      room: 'General Intake A',
      date: 'Sept 19, 2026',
      status: 'Confirmed',
      notes: 'Annual physical examination and routine blood pressure screening.',
    },
    {
      id: 'APPT-102',
      time: '09:00 AM',
      patientId: 'PTNT-006',
      patientName: 'Maria Santos',
      age: 29,
      sex: 'Female',
      contact: '0918-333-4455',
      address: '45 Emerald Ave., Pasig City',
      emergencyName: 'Carlos Santos',
      emergencyContact: '0918-444-5566',
      type: 'General Consultation',
      doctor: 'Dr. Santos',
      room: 'General Intake A',
      date: 'Sept 19, 2026',
      status: 'Checked-In',
      notes: 'Consultation for mild seasonal cough and throat irritation.',
    },
    {
      id: 'APPT-103',
      time: '09:30 AM',
      patientId: null,
      patientName: '*Available Slot*',
      age: null,
      sex: null,
      contact: '',
      address: '',
      emergencyName: '',
      emergencyContact: '',
      type: 'Standard Intake',
      doctor: 'Dr. Santos',
      room: 'General Intake A',
      date: 'Sept 19, 2026',
      status: 'Open',
      notes: 'Open appointment window for walk-in triage or advance booking.',
    },
    {
      id: 'APPT-104',
      time: '10:00 AM',
      patientId: 'PTNT-007',
      patientName: 'Robert Reyes',
      age: 51,
      sex: 'Male',
      contact: '0922-555-6677',
      address: '78 Mabini St., Manila',
      emergencyName: 'Elena Reyes',
      emergencyContact: '0922-666-7788',
      type: 'Follow-up (Routine)',
      doctor: 'Dr. Reyes',
      room: 'General Intake A',
      date: 'Sept 19, 2026',
      status: 'Confirmed',
      notes: 'Follow-up on laboratory panel results and prescription renewal.',
    },
    {
      id: 'APPT-105',
      time: '10:30 AM',
      patientId: 'PTNT-002',
      patientName: 'Allen Tracy',
      age: 21,
      sex: 'Female',
      contact: '0919-345-6789',
      address: '789 Quezon Ave., Quezon City',
      emergencyName: 'Robert Tracy',
      emergencyContact: '0919-765-4321',
      type: 'Follow up',
      doctor: 'Dr. Rebuyaco',
      room: 'Consultation Room 1',
      date: 'Sept 19, 2026',
      status: 'Confirmed',
      notes: 'Follow-up evaluation for resolving allergic rhinitis.',
    },
    {
      id: 'APPT-106',
      time: '11:00 AM',
      patientId: 'PTNT-001',
      patientName: 'Juan Dela Cruz',
      age: 34,
      sex: 'Male',
      contact: '0991-123-1245',
      address: '143 Jose St., Malabon City',
      emergencyName: 'Maria Dela Cruz',
      emergencyContact: '0991-123-1245',
      type: 'Routine Checkup',
      doctor: 'Dr. Cruz',
      room: 'General Intake A',
      date: 'Sept 19, 2026',
      status: 'Checked-In',
      notes: 'Hypertension checkup, follow-up on Amlodipine 5mg regimen.',
    },
    {
      id: 'APPT-107',
      time: '11:30 AM',
      patientId: null,
      patientName: '*Available Slot*',
      age: null,
      sex: null,
      contact: '',
      address: '',
      emergencyName: '',
      emergencyContact: '',
      type: 'General Wellness',
      doctor: 'Dr. Reyes',
      room: 'General Intake A',
      date: 'Sept 19, 2026',
      status: 'Open',
      notes: 'Open slot available for immediate booking.',
    },
    {
      id: 'APPT-108',
      time: '01:30 PM',
      patientId: 'PTNT-003',
      patientName: 'Richiebelle Del Rosario',
      age: 16,
      sex: 'Female',
      contact: '0918-234-5678',
      address: '456 Taft Ave., Pasay City',
      emergencyName: 'Susan Del Rosario',
      emergencyContact: '0918-876-5432',
      type: 'Consultation',
      doctor: 'Dr. Santos',
      room: 'General Intake A',
      date: 'Sept 19, 2026',
      status: 'Confirmed',
      notes: 'Pediatric respiratory follow-up consultation.',
    },
    {
      id: 'APPT-109',
      time: '02:00 PM',
      patientId: 'PTNT-004',
      patientName: 'John Smith',
      age: 19,
      sex: 'Male',
      contact: '0920-456-7890',
      address: '321 Shaw Blvd., Mandaluyong City',
      emergencyName: 'Carlos Smith',
      emergencyContact: '0920-654-3210',
      type: 'Routine Checkup',
      doctor: 'Dr. Reyes',
      room: 'General Intake A',
      date: 'Sept 19, 2026',
      status: 'Confirmed',
      notes: 'Routine fitness verification exam.',
    },
    {
      id: 'APPT-110',
      time: '02:30 PM',
      patientId: null,
      patientName: '*Available Slot*',
      age: null,
      sex: null,
      contact: '',
      address: '',
      emergencyName: '',
      emergencyContact: '',
      type: 'Standard Intake',
      doctor: 'Dr. Santos',
      room: 'General Intake A',
      date: 'Sept 19, 2026',
      status: 'Open',
      notes: 'Afternoon open slot for clinical intake.',
    },
  ];

  const [appointments, setAppointments] = useState(initialAppointments);
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  // Detail card active tab: 'apptInfo' | 'patientInfo' | 'notes'
  const [activeTab, setActiveTab] = useState('apptInfo');

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All'); // 'All' | 'Confirmed' | 'Checked-In' | 'Open'
  const [selectedDoctor, setSelectedDoctor] = useState('All');
  const [selectedRoom, setSelectedRoom] = useState('All');
  const [viewMode, setViewMode] = useState('List'); // 'List' | 'Calendar'

  // Popover toggles
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isOnDuty, setIsOnDuty] = useState(true);

  // Notification items with unread tracking
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      text: 'Maria Santos checked in for 09:00 AM intake.',
      apptId: 'APPT-102',
      time: '10m ago',
      read: false,
    },
    {
      id: 2,
      text: 'Dr. Cruz schedule confirmed for General Intake A.',
      apptId: 'APPT-101',
      time: '25m ago',
      read: false,
    },
    {
      id: 3,
      text: 'New open slot available at 02:30 PM.',
      apptId: 'APPT-110',
      time: '1h ago',
      read: true,
    },
  ]);

  // Inline editing states for Tab 3 (Clinical Notes)
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotesText, setEditedNotesText] = useState('');

  // Inline editing states for Tab 2 (Patient Details)
  const [isEditingPatientInfo, setIsEditingPatientInfo] = useState(false);
  const [patientEditForm, setPatientEditForm] = useState({
    contact: '',
    address: '',
    emergencyName: '',
    emergencyContact: '',
  });

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showBookSlotModal, setShowBookSlotModal] = useState(false);
  const [targetSlot, setTargetSlot] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState('');

  // Form states for New Appointment
  const [newForm, setNewForm] = useState({
    patientName: '',
    time: '08:30 AM',
    type: 'Routine Checkup',
    doctor: 'Dr. Cruz',
    room: 'General Intake A',
    contact: '',
    notes: '',
  });

  // Form state for Editing Appointment
  const [editForm, setEditForm] = useState({});

  // Form state for Booking an Available Slot
  const [bookForm, setBookForm] = useState({
    patientName: '',
    contact: '',
    type: 'Routine Checkup',
    doctor: 'Dr. Cruz',
    notes: '',
  });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 3200);
  };

  // Keyboard accessibility: Escape key closes modals and popovers
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowNewModal(false);
        setShowEditModal(false);
        setShowBookSlotModal(false);
        setShowDeleteConfirm(false);
        setShowLogoutConfirm(false);
        setShowFilterMenu(false);
        setShowDatePicker(false);
        setShowRoomPicker(false);
        setShowNotifications(false);
        setShowProfileMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filtered Appointments
  const filteredAppointments = appointments.filter((appt) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      appt.patientName.toLowerCase().includes(q) ||
      appt.time.toLowerCase().includes(q) ||
      appt.type.toLowerCase().includes(q) ||
      appt.doctor.toLowerCase().includes(q) ||
      appt.room.toLowerCase().includes(q) ||
      (appt.notes && appt.notes.toLowerCase().includes(q)) ||
      (appt.patientId && appt.patientId.toLowerCase().includes(q));

    const matchesFilter =
      activeFilter === 'All' ||
      appt.status.toLowerCase() === activeFilter.toLowerCase();

    const matchesDoctor =
      selectedDoctor === 'All' ||
      appt.doctor.toLowerCase() === selectedDoctor.toLowerCase();

    const matchesRoom =
      selectedRoom === 'All' ||
      appt.room.toLowerCase() === selectedRoom.toLowerCase();

    return matchesSearch && matchesFilter && matchesDoctor && matchesRoom;
  });

  // Calendar stats computation
  const totalSlotsCount = appointments.length;
  const confirmedCount = appointments.filter((a) => a.status === 'Confirmed').length;
  const checkedInCount = appointments.filter((a) => a.status === 'Checked-In').length;
  const openSlotsCount = appointments.filter((a) => a.status === 'Open').length;

  // Action: Check-in patient
  const handleCheckIn = (apptId) => {
    setAppointments((prev) =>
      prev.map((a) => (a.id === apptId ? { ...a, status: 'Checked-In' } : a))
    );
    if (selectedAppointment && selectedAppointment.id === apptId) {
      setSelectedAppointment((prev) => ({ ...prev, status: 'Checked-In' }));
    }
    const target = appointments.find((a) => a.id === apptId);
    const pName = target ? target.patientName : 'Patient';
    // Add interactive notification
    setNotifications((prev) => [
      {
        id: Date.now(),
        text: `${pName} checked in for ${target?.time || 'appointment'}.`,
        apptId,
        time: 'Just now',
        read: false,
      },
      ...prev,
    ]);
    showToast(`${pName} marked as Checked-In!`);
  };

  // Action: Toggle Check-in status back to Confirmed
  const handleRevertStatus = (apptId) => {
    setAppointments((prev) =>
      prev.map((a) => (a.id === apptId ? { ...a, status: 'Confirmed' } : a))
    );
    if (selectedAppointment && selectedAppointment.id === apptId) {
      setSelectedAppointment((prev) => ({ ...prev, status: 'Confirmed' }));
    }
    showToast('Status reverted to Confirmed.');
  };

  // Action: Quick Autofill from existing patients in New Appointment modal
  const handleAutofillNewPatient = (patientId) => {
    const found = patients.find((p) => p.id === patientId);
    if (found) {
      setNewForm((prev) => ({
        ...prev,
        patientName: found.name,
        contact: found.contact || '',
        notes: `Scheduled visit for ${found.name}.`,
      }));
      showToast(`Autofilled ${found.name}`);
    }
  };

  // Action: Quick Autofill from existing patients in Book Slot modal
  const handleAutofillBookPatient = (patientId) => {
    const found = patients.find((p) => p.id === patientId);
    if (found) {
      setBookForm((prev) => ({
        ...prev,
        patientName: found.name,
        contact: found.contact || '',
        notes: `Intake visit booked for ${found.name}.`,
      }));
      showToast(`Autofilled ${found.name}`);
    }
  };

  // Action: Book Available Slot
  const handleOpenBookSlot = (slot) => {
    setTargetSlot(slot);
    setBookForm({
      patientName: '',
      contact: '',
      type: slot.type || 'Routine Checkup',
      doctor: slot.doctor || 'Dr. Cruz',
      notes: '',
    });
    setShowBookSlotModal(true);
  };

  const handleBookSlotSubmit = (e) => {
    e.preventDefault();
    if (!bookForm.patientName.trim()) return;

    // Check if entered patient matches an existing patient in registry
    const matchedPatient = patients.find(
      (p) => p.name.toLowerCase() === bookForm.patientName.trim().toLowerCase()
    );

    const updatedAppt = {
      ...targetSlot,
      patientId: matchedPatient ? matchedPatient.id : `PTNT-${Math.floor(100 + Math.random() * 900)}`,
      patientName: bookForm.patientName.trim(),
      contact: bookForm.contact || matchedPatient?.contact || '0917-000-0000',
      address: matchedPatient?.address || 'Metro Manila',
      emergencyName: matchedPatient?.emergencyName || 'Family Member',
      emergencyContact: matchedPatient?.emergencyContact || '0917-000-0000',
      type: bookForm.type,
      doctor: bookForm.doctor,
      status: 'Confirmed',
      notes: bookForm.notes || 'Appointment booked by Receptionist.',
    };

    setAppointments((prev) =>
      prev.map((a) => (a.id === targetSlot.id ? updatedAppt : a))
    );
    setSelectedAppointment(updatedAppt);
    setShowBookSlotModal(false);
    showToast(`Booked ${targetSlot.time} for ${bookForm.patientName}!`);
  };

  // Action: Create New Appointment
  const handleNewSubmit = (e) => {
    e.preventDefault();
    if (!newForm.patientName.trim()) return;

    const matchedPatient = patients.find(
      (p) => p.name.toLowerCase() === newForm.patientName.trim().toLowerCase()
    );

    const newApptObj = {
      id: `APPT-${100 + appointments.length + 1}`,
      time: newForm.time,
      patientId: matchedPatient ? matchedPatient.id : `PTNT-0${10 + appointments.length}`,
      patientName: newForm.patientName.trim(),
      age: matchedPatient?.age || 32,
      sex: matchedPatient?.sex || 'Male',
      contact: newForm.contact || matchedPatient?.contact || '0917-000-0000',
      address: matchedPatient?.address || 'Metro Manila',
      emergencyName: matchedPatient?.emergencyName || 'Emergency Contact',
      emergencyContact: matchedPatient?.emergencyContact || '0917-000-0000',
      type: newForm.type,
      doctor: newForm.doctor,
      room: newForm.room,
      date: currentDate,
      status: 'Confirmed',
      notes: newForm.notes || 'New intake appointment scheduled.',
    };

    setAppointments((prev) => [newApptObj, ...prev]);
    setSelectedAppointment(newApptObj);
    setShowNewModal(false);
    setNewForm({
      patientName: '',
      time: '08:30 AM',
      type: 'Routine Checkup',
      doctor: 'Dr. Cruz',
      room: 'General Intake A',
      contact: '',
      notes: '',
    });
    showToast(`Appointment booked for ${newApptObj.patientName}!`);
  };

  // Action: Open Edit Modal
  const handleOpenEdit = (appt) => {
    setEditForm({ ...appt });
    setShowEditModal(true);
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    setAppointments((prev) =>
      prev.map((a) => (a.id === editForm.id ? { ...editForm } : a))
    );
    if (selectedAppointment && selectedAppointment.id === editForm.id) {
      setSelectedAppointment({ ...editForm });
    }
    setShowEditModal(false);
    showToast('Appointment updated successfully!');
  };

  // Action: Cancel / Free appointment
  const handleConfirmCancel = () => {
    if (!deleteTarget) return;

    // Convert booked appointment into an available open slot
    const freedSlot = {
      ...deleteTarget,
      patientId: null,
      patientName: '*Available Slot*',
      age: null,
      sex: null,
      contact: '',
      address: '',
      emergencyName: '',
      emergencyContact: '',
      status: 'Open',
      notes: 'Slot freed upon cancellation.',
    };

    setAppointments((prev) =>
      prev.map((a) => (a.id === deleteTarget.id ? freedSlot : a))
    );
    if (selectedAppointment && selectedAppointment.id === deleteTarget.id) {
      setSelectedAppointment(freedSlot);
    }
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
    showToast(`Slot at ${deleteTarget.time} released to Open.`);
  };

  // Action: Inline Editing for Notes (Tab 3)
  const handleStartEditNotes = () => {
    setEditedNotesText(selectedAppointment?.notes || '');
    setIsEditingNotes(true);
  };

  const handleSaveNotes = () => {
    if (!selectedAppointment) return;
    const updated = { ...selectedAppointment, notes: editedNotesText };
    setAppointments((prev) =>
      prev.map((a) => (a.id === selectedAppointment.id ? updated : a))
    );
    setSelectedAppointment(updated);
    setIsEditingNotes(false);
    showToast('Intake notes updated!');
  };

  // Action: Inline Editing for Patient Details (Tab 2)
  const handleStartEditPatientInfo = () => {
    if (!selectedAppointment) return;
    setPatientEditForm({
      contact: selectedAppointment.contact || '',
      address: selectedAppointment.address || '',
      emergencyName: selectedAppointment.emergencyName || '',
      emergencyContact: selectedAppointment.emergencyContact || '',
    });
    setIsEditingPatientInfo(true);
  };

  const handleSavePatientInfo = () => {
    if (!selectedAppointment) return;
    const updated = {
      ...selectedAppointment,
      contact: patientEditForm.contact,
      address: patientEditForm.address,
      emergencyName: patientEditForm.emergencyName,
      emergencyContact: patientEditForm.emergencyContact,
    };
    setAppointments((prev) =>
      prev.map((a) => (a.id === selectedAppointment.id ? updated : a))
    );
    setSelectedAppointment(updated);
    setIsEditingPatientInfo(false);
    showToast('Patient contact details saved!');
  };

  // Interactive Date cycler
  const handlePrevDay = () => {
    if (currentDateIndex > 0) {
      const nextIdx = currentDateIndex - 1;
      setCurrentDateIndex(nextIdx);
      showToast(`Viewing ${availableDates[nextIdx]} schedule`);
    } else {
      showToast('Viewing earliest available schedule date.');
    }
  };

  const handleNextDay = () => {
    if (currentDateIndex < availableDates.length - 1) {
      const nextIdx = currentDateIndex + 1;
      setCurrentDateIndex(nextIdx);
      showToast(`Viewing ${availableDates[nextIdx]} schedule`);
    } else {
      showToast('Viewing latest available schedule date.');
    }
  };

  // Interactive Notification clicking
  const handleNotificationClick = (notif) => {
    // Mark as read
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
    );
    if (notif.apptId) {
      const target = appointments.find((a) => a.id === notif.apptId);
      if (target) {
        setSelectedAppointment(target);
      }
    }
    setShowNotifications(false);
  };

  const unreadNotifsCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="nd-screen-container">
      <div className="nd-dashboard-frame">
        {/* =========================================================================
            FAR LEFT SIDEBAR (Sticky, Height Locked, 3rd Button Active)
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

          {/* Capsule Menu (3rd Button Appointments Module Active) */}
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

            {/* 2. Patients Module */}
            <button
              type="button"
              className="nav-btn"
              onClick={() => onNavigate && onNavigate('patients')}
              title="Patients Module"
              aria-label="Patients Module"
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
                <circle cx="10" cy="8" r="4" fill="#00ADEF" />
                <path d="M2 18c0-3.3 3.6-6 8-6s8 2.7 8 6v1H2v-1z" fill="#00ADEF" />
                <circle cx="18" cy="17" r="4.5" fill="#00ADEF" />
                <path d="M18 15v4M16 17h4" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>

            {/* 3. Appointments Module (Active with cyan filled circle & white icon) */}
            <button
              type="button"
              className="nav-btn active"
              title="Appointments Module"
              aria-label="Appointments Module"
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
                <rect x="4" y="5" width="13" height="16" rx="2" fill="#ffffff" />
                <rect x="7" y="3" width="7" height="3" rx="1.5" fill="#ffffff" />
                <path d="M7 10h5M7 13h5M7 16h3" stroke="#00ADEF" strokeWidth="1.6" strokeLinecap="round" />
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
            MAIN WORKSPACE (Master-Detail Layout matching media_1789818402303.png)
            ========================================================================= */}
        <main className="ap-workspace">
          {/* TOP HEADER */}
          <header className="ap-header">
            <div className="ap-header-titles">
              <h1 className="ap-main-title">Appointments Module</h1>
              <p className="ap-main-subtitle">
                Manage schedules, bookings, and appointment statuses
                <span className="ap-role-tag">Role: Receptionist</span>
              </p>
            </div>

            <div className="ap-header-right">
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
                  {unreadNotifsCount > 0 && (
                    <span className="ap-notif-badge">{unreadNotifsCount}</span>
                  )}
                </button>

                {showNotifications && (
                  <div className="notif-dropdown animate-pop-in" style={{ minWidth: '290px' }}>
                    <div className="dropdown-title">Schedule Notifications</div>
                    {notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`ap-notif-item ${!notif.read ? 'unread' : ''}`}
                        onClick={() => handleNotificationClick(notif)}
                        title="Click to view appointment"
                      >
                        <span className="ap-notif-text">{notif.text}</span>
                        <span className="ap-notif-time">{notif.time}</span>
                      </div>
                    ))}
                    <div className="ap-notif-footer">
                      <button
                        type="button"
                        className="ap-notif-footer-btn"
                        onClick={() => {
                          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                          showToast('All notifications marked read');
                        }}
                      >
                        Mark all read
                      </button>
                      <button
                        type="button"
                        className="ap-notif-footer-btn"
                        onClick={() => {
                          setNotifications([]);
                          showToast('Cleared notifications');
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Avatar Pill & Duty Toggle */}
              <div className="avatar-wrapper">
                <button
                  type="button"
                  className="avatar-circle-btn"
                  onClick={() => {
                    setShowProfileMenu(!showProfileMenu);
                    setShowNotifications(false);
                  }}
                  title="Receptionist Profile & Duty Status"
                  aria-label="Profile"
                >
                  <span>A</span>
                </button>

                {showProfileMenu && (
                  <div className="avatar-dropdown animate-pop-in" style={{ minWidth: '200px' }}>
                    <div className="avatar-nurse-name">Receptionist Desk A</div>
                    <div className="ap-duty-toggle-row">
                      <span className={`ap-duty-badge ${isOnDuty ? 'on-duty' : 'on-break'}`}>
                        {isOnDuty ? '● On Duty' : '○ On Break'}
                      </span>
                      <button
                        type="button"
                        className="ap-duty-switch-btn"
                        onClick={() => {
                          setIsOnDuty(!isOnDuty);
                          showToast(isOnDuty ? 'Receptionist marked On Break' : 'Receptionist marked On Duty');
                        }}
                      >
                        {isOnDuty ? 'Take Break' : 'Resume Duty'}
                      </button>
                    </div>
                    <button
                      type="button"
                      className="menu-signout-btn"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowLogoutConfirm(true);
                      }}
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* 2-COLUMN MASTER-DETAIL SPLIT LAYOUT */}
          <div className="ap-split-layout">
            {/* =====================================================================
                LEFT COLUMN: FILTER CARD + SCHEDULE QUEUE (LIST OR CALENDAR)
                ===================================================================== */}
            <div className="ap-left-col">
              {/* Top Filter Card */}
              <div className="ap-filter-card">
                {/* Row 1: Search Box & + New Appointment Button */}
                <div className="ap-filter-top-row">
                  <div className="ap-search-box">
                    <svg className="ap-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#64748B" strokeWidth="2.2" strokeLinecap="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search patient, ID, doctor, room..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="ap-search-input"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        className="ap-search-clear-btn"
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
                    className="ap-action-btn-cyan"
                    onClick={() => setShowNewModal(true)}
                    title="Schedule a New Appointment"
                  >
                    + New Appointment
                  </button>
                </div>

                {/* Row 2: Status Badges & Popover Filter */}
                <div className="ap-filter-badge-row">
                  <button
                    type="button"
                    className={`ap-pill-btn ${activeFilter === 'All' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('All')}
                  >
                    All Statuses
                  </button>

                  <button
                    type="button"
                    className={`ap-pill-btn ${activeFilter === 'Confirmed' ? 'active' : ''}`}
                    onClick={() => setActiveFilter(activeFilter === 'Confirmed' ? 'All' : 'Confirmed')}
                  >
                    Confirmed
                  </button>

                  <button
                    type="button"
                    className={`ap-pill-btn ${activeFilter === 'Checked-In' ? 'active' : ''}`}
                    onClick={() => setActiveFilter(activeFilter === 'Checked-In' ? 'All' : 'Checked-In')}
                  >
                    Checked-In
                  </button>

                  <button
                    type="button"
                    className={`ap-pill-btn ${activeFilter === 'Open' ? 'active' : ''}`}
                    onClick={() => setActiveFilter(activeFilter === 'Open' ? 'All' : 'Open')}
                  >
                    Open
                  </button>

                  {/* Filter Popover Button */}
                  <div className="ap-filter-btn-wrapper">
                    <button
                      type="button"
                      className={`ap-pill-btn ap-filter-btn ${
                        showFilterMenu || selectedDoctor !== 'All' || selectedRoom !== 'All' ? 'active' : ''
                      }`}
                      onClick={() => setShowFilterMenu(!showFilterMenu)}
                      title="Filter schedule by doctor or room"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                      </svg>
                      Filter {selectedDoctor !== 'All' || selectedRoom !== 'All' ? '●' : ''}
                    </button>

                    {showFilterMenu && (
                      <div className="ap-filter-dropdown animate-pop-in">
                        <div className="ap-dropdown-header">
                          <span className="ap-dropdown-title">Filter Schedule</span>
                          <button
                            type="button"
                            className="ap-dropdown-close"
                            onClick={() => setShowFilterMenu(false)}
                            aria-label="Close menu"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="ap-dropdown-section">
                          <label className="ap-dropdown-label">Filter by Doctor</label>
                          <select
                            className="ap-dropdown-select"
                            value={selectedDoctor}
                            onChange={(e) => setSelectedDoctor(e.target.value)}
                          >
                            <option value="All">All Doctors</option>
                            <option value="Dr. Cruz">Dr. Cruz</option>
                            <option value="Dr. Santos">Dr. Santos</option>
                            <option value="Dr. Reyes">Dr. Reyes</option>
                            <option value="Dr. Rebuyaco">Dr. Rebuyaco</option>
                          </select>
                        </div>

                        <div className="ap-dropdown-section">
                          <label className="ap-dropdown-label">Filter by Room</label>
                          <select
                            className="ap-dropdown-select"
                            value={selectedRoom}
                            onChange={(e) => setSelectedRoom(e.target.value)}
                          >
                            <option value="All">All Rooms</option>
                            <option value="General Intake A">General Intake A</option>
                            <option value="Consultation Room 1">Consultation Room 1</option>
                            <option value="Consultation Room 2">Consultation Room 2</option>
                          </select>
                        </div>

                        <div className="ap-dropdown-actions">
                          <button
                            type="button"
                            className="ap-dropdown-reset-btn"
                            onClick={() => {
                              setSelectedDoctor('All');
                              setSelectedRoom('All');
                              setShowFilterMenu(false);
                              showToast('Filters reset');
                            }}
                          >
                            Reset
                          </button>
                          <button
                            type="button"
                            className="ap-dropdown-apply-btn"
                            onClick={() => setShowFilterMenu(false)}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sub-bar: Interactive Date, Room & View: List / Calendar */}
                <div className="ap-metadata-subbar">
                  <div className="ap-subbar-left">
                    {/* Interactive Date Switcher & Popover */}
                    <div className="ap-picker-wrapper">
                      <div className="ap-meta-chip">
                        <button
                          type="button"
                          className="ap-date-btn"
                          onClick={handlePrevDay}
                          title="Previous Day"
                          aria-label="Previous Day"
                        >
                          ◀
                        </button>
                        <span
                          className="clickable"
                          onClick={() => setShowDatePicker(!showDatePicker)}
                          title="Click to jump to date"
                          style={{ cursor: 'pointer' }}
                        >
                          DATE: <strong>{currentDate}</strong> ▾
                        </span>
                        <button
                          type="button"
                          className="ap-date-btn"
                          onClick={handleNextDay}
                          title="Next Day"
                          aria-label="Next Day"
                        >
                          ▶
                        </button>
                      </div>

                      {showDatePicker && (
                        <div className="ap-picker-dropdown animate-pop-in">
                          <span style={{ fontSize: '0.74rem', color: '#64748B', padding: '2px 8px', fontWeight: 600 }}>
                            Select Date:
                          </span>
                          {availableDates.map((d, idx) => (
                            <button
                              key={d}
                              type="button"
                              className={`ap-picker-item ${idx === currentDateIndex ? 'active' : ''}`}
                              onClick={() => {
                                setCurrentDateIndex(idx);
                                setShowDatePicker(false);
                                showToast(`Viewing ${d}`);
                              }}
                            >
                              {d} {idx === 1 ? '(Today)' : ''}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Interactive Room Chip */}
                    <div className="ap-picker-wrapper">
                      <div
                        className="ap-meta-chip clickable"
                        onClick={() => setShowRoomPicker(!showRoomPicker)}
                        title="Click to change room filter"
                      >
                        <span>
                          ROOM: <strong>{selectedRoom === 'All' ? 'General Intake A' : selectedRoom}</strong> ▾
                        </span>
                      </div>

                      {showRoomPicker && (
                        <div className="ap-picker-dropdown animate-pop-in">
                          <span style={{ fontSize: '0.74rem', color: '#64748B', padding: '2px 8px', fontWeight: 600 }}>
                            Room Filter:
                          </span>
                          {['All Rooms', 'General Intake A', 'Consultation Room 1', 'Consultation Room 2'].map((rm) => (
                            <button
                              key={rm}
                              type="button"
                              className={`ap-picker-item ${
                                (rm === 'All Rooms' && selectedRoom === 'All') || selectedRoom === rm ? 'active' : ''
                              }`}
                              onClick={() => {
                                setSelectedRoom(rm === 'All Rooms' ? 'All' : rm);
                                setShowRoomPicker(false);
                                showToast(rm === 'All Rooms' ? 'Viewing All Rooms' : `Filtered to ${rm}`);
                              }}
                            >
                              {rm}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Active Doctor Filter Chip with Clear Button */}
                    {selectedDoctor !== 'All' && (
                      <div className="ap-meta-chip">
                        <span>
                          DOCTOR: <strong>{selectedDoctor}</strong>
                        </span>
                        <button
                          type="button"
                          className="ap-chip-clear-btn"
                          onClick={() => {
                            setSelectedDoctor('All');
                            showToast('Doctor filter cleared');
                          }}
                          title="Clear Doctor filter"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>

                  {/* View: List / Calendar Segmented Toggle */}
                  <div className="ap-view-toggle">
                    <button
                      type="button"
                      className={`ap-view-btn ${viewMode === 'List' ? 'active' : ''}`}
                      onClick={() => setViewMode('List')}
                    >
                      List View
                    </button>
                    <button
                      type="button"
                      className={`ap-view-btn ${viewMode === 'Calendar' ? 'active' : ''}`}
                      onClick={() => {
                        setViewMode('Calendar');
                        showToast('Switching to Calendar View');
                      }}
                    >
                      Calendar View
                    </button>
                  </div>
                </div>
              </div>

              {/* ===================================================================
                  SCHEDULE VIEW: LIST VIEW OR CALENDAR VIEW
                  =================================================================== */}
              {viewMode === 'List' ? (
                /* Continuous Dividers Schedule Queue Card */
                <div className="ap-schedule-card">
                  {/* Table Head */}
                  <div className="ap-table-head-row">
                    <div>TIME</div>
                    <div>PATIENT NAME</div>
                    <div>APPT TYPE</div>
                    <div>STATUS</div>
                    <div style={{ textAlign: 'right' }}>ACTIONS</div>
                  </div>

                  {/* Table Rows */}
                  {filteredAppointments.length > 0 ? (
                    filteredAppointments.map((appt) => {
                      const isSelected = selectedAppointment?.id === appt.id;
                      const isOpen = appt.status === 'Open';

                      return (
                        <div
                          key={appt.id}
                          className={`ap-table-row ${isSelected ? 'selected' : ''} ${isOpen ? 'is-open' : ''}`}
                          onClick={() => setSelectedAppointment(appt)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setSelectedAppointment(appt);
                            }
                          }}
                        >
                          {/* Time Column */}
                          <div className="ap-col-time">{appt.time}</div>

                          {/* Patient Column */}
                          <div className="ap-col-patient">
                            <span className={`ap-patient-name ${isOpen ? 'open-slot' : ''}`}>
                              {appt.patientName}
                            </span>
                            {!isOpen && (
                              <span className="ap-patient-sub">
                                {appt.patientId ? `${appt.patientId} • ` : ''}
                                {appt.contact || 'No contact'}
                              </span>
                            )}
                          </div>

                          {/* Type & Doctor Column */}
                          <div className="ap-col-type">
                            <span className="ap-type-title">{appt.type}</span>
                            <span className="ap-type-doc">{appt.doctor}</span>
                          </div>

                          {/* Status Badge */}
                          <div className="ap-col-status">
                            <span
                              className={`ap-badge ${
                                appt.status === 'Confirmed'
                                  ? 'confirmed'
                                  : appt.status === 'Checked-In'
                                  ? 'checked-in'
                                  : appt.status === 'Open'
                                  ? 'open'
                                  : 'cancelled'
                              }`}
                            >
                              {appt.status}
                            </span>
                          </div>

                          {/* Actions (Clean Text, 8px Rounded Rects, No Brackets) */}
                          <div className="ap-col-actions" onClick={(e) => e.stopPropagation()}>
                            {isOpen ? (
                              <button
                                type="button"
                                className="ap-btn-mini-book"
                                onClick={() => handleOpenBookSlot(appt)}
                                title="Book this available slot"
                              >
                                Book
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="ap-btn-mini-edit"
                                  onClick={() => handleOpenEdit(appt)}
                                  title="Edit Appointment"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="ap-btn-mini-del"
                                  onClick={() => {
                                    setDeleteTarget(appt);
                                    setShowDeleteConfirm(true);
                                  }}
                                  title="Cancel Appointment"
                                  aria-label="Cancel Appointment"
                                >
                                  ✕
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="ap-empty-list">
                      No appointments matching your current search or filter criteria.
                    </div>
                  )}
                </div>
              ) : (
                /* Interactive Calendar Schedule Grid View */
                <div className="ap-calendar-card">
                  {/* Summary Bar */}
                  <div className="ap-cal-summary-bar">
                    <div className="ap-cal-summary-title">
                      <span>Schedule: <strong>{currentDate}</strong></span>
                    </div>
                    <div className="ap-cal-stats">
                      <span className="ap-cal-stat-pill total">Total: {totalSlotsCount}</span>
                      <span className="ap-cal-stat-pill confirmed">Confirmed: {confirmedCount}</span>
                      <span className="ap-cal-stat-pill checked-in">Checked-In: {checkedInCount}</span>
                      <span className="ap-cal-stat-pill open">Open Slots: {openSlotsCount}</span>
                    </div>
                  </div>

                  {/* Calendar Timeline List */}
                  <div className="ap-cal-timeline-list">
                    {filteredAppointments.length > 0 ? (
                      filteredAppointments.map((appt) => {
                        const isSelected = selectedAppointment?.id === appt.id;
                        const isOpen = appt.status === 'Open';

                        return (
                          <div
                            key={appt.id}
                            className={`ap-cal-slot-card ${isSelected ? 'selected' : ''} ${isOpen ? 'is-open' : ''}`}
                            onClick={() => setSelectedAppointment(appt)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                setSelectedAppointment(appt);
                              }
                            }}
                          >
                            <div className="ap-cal-slot-left">
                              <span className="ap-cal-time-pill">{appt.time}</span>
                              <div className="ap-cal-slot-info">
                                <span className={`ap-cal-patient-name ${isOpen ? 'open-title' : ''}`}>
                                  {appt.patientName}
                                </span>
                                <span className="ap-cal-meta-line">
                                  <span>{appt.type}</span>
                                  <span>•</span>
                                  <span>{appt.doctor}</span>
                                  <span>•</span>
                                  <span>{appt.room}</span>
                                </span>
                              </div>
                            </div>

                            <div className="ap-cal-slot-right" onClick={(e) => e.stopPropagation()}>
                              <span
                                className={`ap-badge ${
                                  appt.status === 'Confirmed'
                                    ? 'confirmed'
                                    : appt.status === 'Checked-In'
                                    ? 'checked-in'
                                    : appt.status === 'Open'
                                    ? 'open'
                                    : 'cancelled'
                                }`}
                              >
                                {appt.status}
                              </span>

                              {isOpen ? (
                                <button
                                  type="button"
                                  className="ap-btn-mini-book"
                                  onClick={() => handleOpenBookSlot(appt)}
                                  title="Book this slot"
                                >
                                  Book
                                </button>
                              ) : (
                                <>
                                  {appt.status !== 'Checked-In' && (
                                    <button
                                      type="button"
                                      className="ap-btn-mini-book"
                                      style={{ background: '#10B981' }}
                                      onClick={() => handleCheckIn(appt.id)}
                                      title="Check-in patient"
                                    >
                                      Check-In
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="ap-btn-mini-edit"
                                    onClick={() => handleOpenEdit(appt)}
                                    title="Edit details"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="ap-btn-mini-del"
                                    onClick={() => {
                                      setDeleteTarget(appt);
                                      setShowDeleteConfirm(true);
                                    }}
                                    title="Cancel slot"
                                  >
                                    ✕
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="ap-empty-list">
                        No appointments found for the selected view.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* =====================================================================
                RIGHT COLUMN: EMPTY STATE OR APPOINTMENT DETAILS CARD
                ===================================================================== */}
            <div className="ap-right-col">
              {!selectedAppointment ? (
                /* Empty State: Matching media_1789818402303.png */
                <div className="ap-empty-state-panel">
                  <div className="ap-empty-icon-box">
                    <svg viewBox="0 0 48 56" width="56" height="64" fill="none">
                      <rect x="6" y="8" width="36" height="44" rx="4" stroke="#CBD5E1" strokeWidth="2.5" />
                      <rect x="16" y="3" width="16" height="9" rx="2.5" stroke="#CBD5E1" strokeWidth="2.5" fill="#ffffff" />
                      <line x1="14" y1="22" x2="34" y2="22" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
                      <line x1="14" y1="29" x2="34" y2="29" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
                      <line x1="14" y1="36" x2="34" y2="36" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
                      <line x1="14" y1="43" x2="26" y2="43" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <h3 className="ap-empty-title">No appointment selected</h3>
                  <p className="ap-empty-subtitle">
                    Select an appointment from the schedule to view details or manage status.
                  </p>
                  <button
                    type="button"
                    className="ap-btn-pill-cyan"
                    style={{ marginTop: '20px' }}
                    onClick={() => setShowNewModal(true)}
                  >
                    + Schedule Appointment
                  </button>
                </div>
              ) : (
                /* Appointment Details Card (1:1 matching media_1789818402303.png) */
                <div className="ap-details-card animate-fade">
                  {/* Top Bar with Close button */}
                  <div className="ap-card-top-bar">
                    <h2 className="ap-card-title">Appointment Details</h2>
                    <button
                      type="button"
                      className="ap-card-close-x"
                      onClick={() => setSelectedAppointment(null)}
                      title="Close panel"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Summary Banner */}
                  <div className="ap-card-summary">
                    <div className={`ap-summary-avatar ${selectedAppointment.status === 'Open' ? 'is-open-avatar' : ''}`}>
                      {selectedAppointment.status === 'Open' ? (
                        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round">
                          <circle cx="12" cy="12" r="9" />
                          <line x1="12" y1="8" x2="12" y2="16" />
                          <line x1="8" y1="12" x2="16" y2="12" />
                        </svg>
                      ) : (
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
                      )}
                    </div>

                    <div className="ap-summary-info">
                      <span className="ap-summary-time-chip">
                        {selectedAppointment.time} • {selectedAppointment.date}
                      </span>
                      <h3 className="ap-summary-name">{selectedAppointment.patientName}</h3>
                      <div className="ap-summary-meta">
                        {selectedAppointment.type} • {selectedAppointment.room}
                      </div>
                      <div className="ap-summary-doc">{selectedAppointment.doctor}</div>
                    </div>
                  </div>

                  {/* 3 Interactive Tabs */}
                  <div className="ap-tabs-bar" role="tablist">
                    <button
                      type="button"
                      className={`ap-tab-btn ${activeTab === 'apptInfo' ? 'active' : ''}`}
                      onClick={() => setActiveTab('apptInfo')}
                    >
                      Appointment Info
                    </button>
                    <button
                      type="button"
                      className={`ap-tab-btn ${activeTab === 'patientInfo' ? 'active' : ''}`}
                      onClick={() => setActiveTab('patientInfo')}
                    >
                      Patient Details
                    </button>
                    <button
                      type="button"
                      className={`ap-tab-btn ${activeTab === 'notes' ? 'active' : ''}`}
                      onClick={() => setActiveTab('notes')}
                    >
                      Notes & Intake
                    </button>
                  </div>

                  {/* TAB 1: Appointment Info */}
                  {activeTab === 'apptInfo' && (
                    <div className="ap-tab-content animate-fade">
                      <h4 className="ap-tab-heading">Visit Schedule Information</h4>

                      <div className="ap-info-grid-2col">
                        <div className="ap-info-item">
                          <span className="ap-info-lbl">Scheduled Time</span>
                          <span className="ap-info-val">{selectedAppointment.time}</span>
                        </div>

                        <div className="ap-info-item">
                          <span className="ap-info-lbl">Scheduled Date</span>
                          <span className="ap-info-val">{selectedAppointment.date}</span>
                        </div>

                        <div className="ap-info-item">
                          <span className="ap-info-lbl">Assigned Room</span>
                          <span className="ap-info-val">{selectedAppointment.room}</span>
                        </div>

                        <div className="ap-info-item">
                          <span className="ap-info-lbl">Attending Physician</span>
                          <span className="ap-info-val">{selectedAppointment.doctor}</span>
                        </div>

                        <div className="ap-info-item">
                          <span className="ap-info-lbl">Appointment Type</span>
                          <span className="ap-info-val">{selectedAppointment.type}</span>
                        </div>

                        <div className="ap-info-item">
                          <span className="ap-info-lbl">Current Status</span>
                          <span className="ap-info-val">
                            <span
                              className={`ap-badge ${
                                selectedAppointment.status === 'Confirmed'
                                  ? 'confirmed'
                                  : selectedAppointment.status === 'Checked-In'
                                  ? 'checked-in'
                                  : selectedAppointment.status === 'Open'
                                  ? 'open'
                                  : 'cancelled'
                              }`}
                            >
                              {selectedAppointment.status}
                            </span>
                          </span>
                        </div>
                      </div>

                      {/* Footer Actions (Matching User Specifications: 8px Rounded Rects, No Glow) */}
                      <div className="ap-card-actions">
                        {selectedAppointment.status === 'Open' ? (
                          <button
                            type="button"
                            className="ap-btn-pill-cyan"
                            onClick={() => handleOpenBookSlot(selectedAppointment)}
                          >
                            Book Slot
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="ap-btn-pill-ghost"
                              onClick={() => {
                                setDeleteTarget(selectedAppointment);
                                setShowDeleteConfirm(true);
                              }}
                            >
                              Cancel
                            </button>

                            {selectedAppointment.status !== 'Checked-In' ? (
                              <button
                                type="button"
                                className="ap-btn-pill-green"
                                onClick={() => handleCheckIn(selectedAppointment.id)}
                              >
                                Check-In
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="ap-btn-pill-ghost"
                                onClick={() => handleRevertStatus(selectedAppointment.id)}
                                title="Click to undo check-in"
                              >
                                Undo Check-In
                              </button>
                            )}

                            <button
                              type="button"
                              className="ap-btn-pill-cyan"
                              onClick={() => handleOpenEdit(selectedAppointment)}
                            >
                              Edit
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: Patient Details */}
                  {activeTab === 'patientInfo' && (
                    <div className="ap-tab-content animate-fade">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h4 className="ap-tab-heading">Registered Patient Details</h4>
                        {selectedAppointment.status !== 'Open' && !isEditingPatientInfo && (
                          <button
                            type="button"
                            className="ap-btn-pill-ghost"
                            style={{ padding: '4px 12px', fontSize: '0.78rem' }}
                            onClick={handleStartEditPatientInfo}
                          >
                            Edit Contact Info
                          </button>
                        )}
                      </div>

                      {selectedAppointment.status === 'Open' ? (
                        <p style={{ color: '#64748B', fontSize: '0.92rem' }}>
                          This slot is currently open and has no assigned patient records. Click <strong>Book Slot</strong> below to assign a patient.
                        </p>
                      ) : isEditingPatientInfo ? (
                        /* Inline Patient Details Editor */
                        <div className="ap-inline-edit-box animate-fade">
                          <div className="ap-inline-field">
                            <label className="ap-inline-label">Contact Number</label>
                            <input
                              type="text"
                              className="ap-inline-input"
                              value={patientEditForm.contact}
                              onChange={(e) => setPatientEditForm({ ...patientEditForm, contact: e.target.value })}
                            />
                          </div>

                          <div className="ap-inline-field">
                            <label className="ap-inline-label">Home Address</label>
                            <input
                              type="text"
                              className="ap-inline-input"
                              value={patientEditForm.address}
                              onChange={(e) => setPatientEditForm({ ...patientEditForm, address: e.target.value })}
                            />
                          </div>

                          <div className="ap-form-grid-2">
                            <div className="ap-inline-field">
                              <label className="ap-inline-label">Emergency Contact Name</label>
                              <input
                                type="text"
                                className="ap-inline-input"
                                value={patientEditForm.emergencyName}
                                onChange={(e) => setPatientEditForm({ ...patientEditForm, emergencyName: e.target.value })}
                              />
                            </div>
                            <div className="ap-inline-field">
                              <label className="ap-inline-label">Emergency Phone</label>
                              <input
                                type="text"
                                className="ap-inline-input"
                                value={patientEditForm.emergencyContact}
                                onChange={(e) => setPatientEditForm({ ...patientEditForm, emergencyContact: e.target.value })}
                              />
                            </div>
                          </div>

                          <div className="ap-inline-actions">
                            <button
                              type="button"
                              className="ap-btn-pill-ghost"
                              onClick={() => setIsEditingPatientInfo(false)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="ap-btn-pill-cyan"
                              onClick={handleSavePatientInfo}
                            >
                              Save Details
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="ap-info-grid-2col">
                          <div className="ap-info-item">
                            <span className="ap-info-lbl">Full Name</span>
                            <span className="ap-info-val">{selectedAppointment.patientName}</span>
                          </div>

                          <div className="ap-info-item">
                            <span className="ap-info-lbl">Patient ID</span>
                            <span className="ap-info-val">{selectedAppointment.patientId || 'PTNT-NEW'}</span>
                          </div>

                          <div className="ap-info-item">
                            <span className="ap-info-lbl">Age / Sex</span>
                            <span className="ap-info-val">
                              {selectedAppointment.age ? `${selectedAppointment.age} years old` : '28 years old'} | {selectedAppointment.sex || 'Male'}
                            </span>
                          </div>

                          <div className="ap-info-item">
                            <span className="ap-info-lbl">Contact Number</span>
                            <span className="ap-info-val">{selectedAppointment.contact || 'N/A'}</span>
                          </div>

                          <div className="ap-info-item full-width">
                            <span className="ap-info-lbl">Home Address</span>
                            <span className="ap-info-val">{selectedAppointment.address || 'Address on file'}</span>
                          </div>

                          <div className="ap-info-item full-width">
                            <span className="ap-info-lbl">Emergency Contact</span>
                            <span className="ap-info-val">
                              {selectedAppointment.emergencyName
                                ? `${selectedAppointment.emergencyName} • ${selectedAppointment.emergencyContact}`
                                : 'None listed'}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="ap-card-actions">
                        {selectedAppointment.status === 'Open' ? (
                          <button
                            type="button"
                            className="ap-btn-pill-cyan"
                            onClick={() => handleOpenBookSlot(selectedAppointment)}
                          >
                            Book Slot
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ap-btn-pill-cyan"
                            onClick={() => onNavigate && onNavigate('patients')}
                            title="Navigate directly to Patients Module"
                          >
                            View Full Patient Profile
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: Notes & History */}
                  {activeTab === 'notes' && (
                    <div className="ap-tab-content animate-fade">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h4 className="ap-tab-heading">Clinical Intake Notes</h4>
                        {!isEditingNotes && (
                          <button
                            type="button"
                            className="ap-btn-pill-ghost"
                            style={{ padding: '4px 12px', fontSize: '0.78rem' }}
                            onClick={handleStartEditNotes}
                          >
                            Edit Notes
                          </button>
                        )}
                      </div>

                      {isEditingNotes ? (
                        /* Inline Notes Editor */
                        <div className="ap-inline-edit-box animate-fade">
                          <label className="ap-inline-label">Edit Intake Notes</label>
                          <textarea
                            className="ap-inline-textarea"
                            value={editedNotesText}
                            onChange={(e) => setEditedNotesText(e.target.value)}
                            placeholder="Type updated intake notes..."
                          />
                          <div className="ap-inline-actions">
                            <button
                              type="button"
                              className="ap-btn-pill-ghost"
                              onClick={() => setIsEditingNotes(false)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="ap-btn-pill-cyan"
                              onClick={handleSaveNotes}
                            >
                              Save Notes
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="ap-info-grid-2col">
                          <div className="ap-info-item full-width">
                            <span className="ap-info-lbl">Receptionist Intake Notes</span>
                            <span className="ap-info-val">{selectedAppointment.notes}</span>
                          </div>

                          <div className="ap-info-item">
                            <span className="ap-info-lbl">Booking Timestamp</span>
                            <span className="ap-info-val">Recorded on {selectedAppointment.date}</span>
                          </div>

                          <div className="ap-info-item">
                            <span className="ap-info-lbl">Authorization</span>
                            <span className="ap-info-val">Receptionist Desk A</span>
                          </div>
                        </div>
                      )}

                      <div className="ap-card-actions">
                        <button
                          type="button"
                          className="ap-btn-pill-ghost"
                          onClick={() => handleOpenEdit(selectedAppointment)}
                        >
                          Edit Full Appointment
                        </button>
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
          MODAL 1: SCHEDULE NEW APPOINTMENT (With Patient Autofill)
          ========================================================================= */}
      {showNewModal && (
        <div className="ap-modal-overlay animate-fade" onClick={() => setShowNewModal(false)}>
          <div className="ap-modal-card animate-zoom" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3 className="ap-modal-title">Schedule New Appointment</h3>
              <button
                type="button"
                className="ap-modal-close"
                onClick={() => setShowNewModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleNewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="ap-form-grid-2">
                {/* Existing Patient Quick Selector */}
                {patients && patients.length > 0 && (
                  <div className="ap-form-field full-width">
                    <label className="ap-form-label">Quick Select Existing Patient</label>
                    <select
                      className="ap-form-select"
                      onChange={(e) => handleAutofillNewPatient(e.target.value)}
                      defaultValue=""
                    >
                      <option value="">-- Choose Registered Patient or Type Below --</option>
                      {patients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.id})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="ap-form-field">
                  <label className="ap-form-label">Patient Name *</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Roberto Gomez"
                    className="ap-form-input"
                    value={newForm.patientName}
                    onChange={(e) => setNewForm({ ...newForm, patientName: e.target.value })}
                  />
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Time Slot *</label>
                  <select
                    className="ap-form-select"
                    value={newForm.time}
                    onChange={(e) => setNewForm({ ...newForm, time: e.target.value })}
                  >
                    <option value="08:30 AM">08:30 AM</option>
                    <option value="09:00 AM">09:00 AM</option>
                    <option value="09:30 AM">09:30 AM</option>
                    <option value="10:00 AM">10:00 AM</option>
                    <option value="10:30 AM">10:30 AM</option>
                    <option value="11:00 AM">11:00 AM</option>
                    <option value="01:30 PM">01:30 PM</option>
                    <option value="02:00 PM">02:00 PM</option>
                    <option value="02:30 PM">02:30 PM</option>
                  </select>
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Contact Number</label>
                  <input
                    type="text"
                    placeholder="0917-000-0000"
                    className="ap-form-input"
                    value={newForm.contact}
                    onChange={(e) => setNewForm({ ...newForm, contact: e.target.value })}
                  />
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Appointment Type *</label>
                  <select
                    className="ap-form-select"
                    value={newForm.type}
                    onChange={(e) => setNewForm({ ...newForm, type: e.target.value })}
                  >
                    <option value="Routine Checkup">Routine Checkup</option>
                    <option value="General Consultation">General Consultation</option>
                    <option value="Follow-up (Routine)">Follow-up (Routine)</option>
                    <option value="Standard Intake">Standard Intake</option>
                  </select>
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Attending Doctor *</label>
                  <select
                    className="ap-form-select"
                    value={newForm.doctor}
                    onChange={(e) => setNewForm({ ...newForm, doctor: e.target.value })}
                  >
                    <option value="Dr. Cruz">Dr. Cruz</option>
                    <option value="Dr. Santos">Dr. Santos</option>
                    <option value="Dr. Reyes">Dr. Reyes</option>
                    <option value="Dr. Rebuyaco">Dr. Rebuyaco</option>
                  </select>
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Room Assignment</label>
                  <select
                    className="ap-form-select"
                    value={newForm.room}
                    onChange={(e) => setNewForm({ ...newForm, room: e.target.value })}
                  >
                    <option value="General Intake A">General Intake A</option>
                    <option value="Consultation Room 1">Consultation Room 1</option>
                    <option value="Consultation Room 2">Consultation Room 2</option>
                  </select>
                </div>

                <div className="ap-form-field full-width">
                  <label className="ap-form-label">Intake Notes / Chief Complaint</label>
                  <textarea
                    placeholder="Reason for visit or clinical intake details..."
                    className="ap-form-textarea"
                    value={newForm.notes}
                    onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="ap-modal-footer">
                <button
                  type="button"
                  className="ap-btn-pill-ghost"
                  onClick={() => setShowNewModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ap-btn-pill-cyan"
                >
                  Save & Confirm Appointment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: BOOK AVAILABLE SLOT (With Patient Autofill)
          ========================================================================= */}
      {showBookSlotModal && targetSlot && (
        <div className="ap-modal-overlay animate-fade" onClick={() => setShowBookSlotModal(false)}>
          <div className="ap-modal-card animate-zoom" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3 className="ap-modal-title">Book Slot: {targetSlot.time}</h3>
              <button
                type="button"
                className="ap-modal-close"
                onClick={() => setShowBookSlotModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleBookSlotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="ap-form-grid-2">
                {/* Existing Patient Quick Selector */}
                {patients && patients.length > 0 && (
                  <div className="ap-form-field full-width">
                    <label className="ap-form-label">Quick Select Existing Patient</label>
                    <select
                      className="ap-form-select"
                      onChange={(e) => handleAutofillBookPatient(e.target.value)}
                      defaultValue=""
                    >
                      <option value="">-- Choose Registered Patient or Type Below --</option>
                      {patients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.id})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="ap-form-field full-width">
                  <label className="ap-form-label">Patient Full Name *</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Enter patient name"
                    className="ap-form-input"
                    value={bookForm.patientName}
                    onChange={(e) => setBookForm({ ...bookForm, patientName: e.target.value })}
                  />
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Contact Number</label>
                  <input
                    type="text"
                    placeholder="0917-000-0000"
                    className="ap-form-input"
                    value={bookForm.contact}
                    onChange={(e) => setBookForm({ ...bookForm, contact: e.target.value })}
                  />
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Appointment Type</label>
                  <select
                    className="ap-form-select"
                    value={bookForm.type}
                    onChange={(e) => setBookForm({ ...bookForm, type: e.target.value })}
                  >
                    <option value="Routine Checkup">Routine Checkup</option>
                    <option value="General Consultation">General Consultation</option>
                    <option value="Follow-up (Routine)">Follow-up (Routine)</option>
                    <option value="Standard Intake">Standard Intake</option>
                  </select>
                </div>

                <div className="ap-form-field full-width">
                  <label className="ap-form-label">Doctor</label>
                  <select
                    className="ap-form-select"
                    value={bookForm.doctor}
                    onChange={(e) => setBookForm({ ...bookForm, doctor: e.target.value })}
                  >
                    <option value="Dr. Cruz">Dr. Cruz</option>
                    <option value="Dr. Santos">Dr. Santos</option>
                    <option value="Dr. Reyes">Dr. Reyes</option>
                    <option value="Dr. Rebuyaco">Dr. Rebuyaco</option>
                  </select>
                </div>

                <div className="ap-form-field full-width">
                  <label className="ap-form-label">Notes</label>
                  <textarea
                    placeholder="Optional booking notes..."
                    className="ap-form-textarea"
                    value={bookForm.notes}
                    onChange={(e) => setBookForm({ ...bookForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="ap-modal-footer">
                <button
                  type="button"
                  className="ap-btn-pill-ghost"
                  onClick={() => setShowBookSlotModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ap-btn-pill-cyan"
                >
                  Confirm Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: EDIT APPOINTMENT
          ========================================================================= */}
      {showEditModal && editForm.id && (
        <div className="ap-modal-overlay animate-fade" onClick={() => setShowEditModal(false)}>
          <div className="ap-modal-card animate-zoom" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3 className="ap-modal-title">Edit Appointment: {editForm.patientName}</h3>
              <button
                type="button"
                className="ap-modal-close"
                onClick={() => setShowEditModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="ap-form-grid-2">
                <div className="ap-form-field">
                  <label className="ap-form-label">Patient Name</label>
                  <input
                    type="text"
                    required
                    className="ap-form-input"
                    value={editForm.patientName}
                    onChange={(e) => setEditForm({ ...editForm, patientName: e.target.value })}
                  />
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Time</label>
                  <select
                    className="ap-form-select"
                    value={editForm.time}
                    onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                  >
                    <option value="08:30 AM">08:30 AM</option>
                    <option value="09:00 AM">09:00 AM</option>
                    <option value="09:30 AM">09:30 AM</option>
                    <option value="10:00 AM">10:00 AM</option>
                    <option value="10:30 AM">10:30 AM</option>
                    <option value="11:00 AM">11:00 AM</option>
                    <option value="01:30 PM">01:30 PM</option>
                    <option value="02:00 PM">02:00 PM</option>
                    <option value="02:30 PM">02:30 PM</option>
                  </select>
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Doctor</label>
                  <select
                    className="ap-form-select"
                    value={editForm.doctor}
                    onChange={(e) => setEditForm({ ...editForm, doctor: e.target.value })}
                  >
                    <option value="Dr. Cruz">Dr. Cruz</option>
                    <option value="Dr. Santos">Dr. Santos</option>
                    <option value="Dr. Reyes">Dr. Reyes</option>
                    <option value="Dr. Rebuyaco">Dr. Rebuyaco</option>
                  </select>
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Room</label>
                  <select
                    className="ap-form-select"
                    value={editForm.room}
                    onChange={(e) => setEditForm({ ...editForm, room: e.target.value })}
                  >
                    <option value="General Intake A">General Intake A</option>
                    <option value="Consultation Room 1">Consultation Room 1</option>
                    <option value="Consultation Room 2">Consultation Room 2</option>
                  </select>
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Status</label>
                  <select
                    className="ap-form-select"
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  >
                    <option value="Confirmed">Confirmed</option>
                    <option value="Checked-In">Checked-In</option>
                    <option value="Open">Open</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Appointment Type</label>
                  <select
                    className="ap-form-select"
                    value={editForm.type}
                    onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                  >
                    <option value="Routine Checkup">Routine Checkup</option>
                    <option value="General Consultation">General Consultation</option>
                    <option value="Follow-up (Routine)">Follow-up (Routine)</option>
                    <option value="Standard Intake">Standard Intake</option>
                  </select>
                </div>

                <div className="ap-form-field full-width">
                  <label className="ap-form-label">Clinical Notes</label>
                  <textarea
                    className="ap-form-textarea"
                    value={editForm.notes || ''}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="ap-modal-footer">
                <button
                  type="button"
                  className="ap-btn-pill-ghost"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ap-btn-pill-cyan"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: CANCEL / FREE SLOT CONFIRMATION
          ========================================================================= */}
      {showDeleteConfirm && deleteTarget && (
        <div className="ap-modal-overlay animate-fade" onClick={() => setShowDeleteConfirm(false)}>
          <div className="ap-modal-card animate-zoom" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3 className="ap-modal-title" style={{ color: '#EF4444' }}>Cancel Appointment</h3>
              <button
                type="button"
                className="ap-modal-close"
                onClick={() => setShowDeleteConfirm(false)}
              >
                ✕
              </button>
            </div>
            <p style={{ color: '#475569', fontSize: '0.92rem', lineHeight: '1.5' }}>
              Are you sure you want to cancel the appointment for <strong>{deleteTarget.patientName}</strong> at <strong>{deleteTarget.time}</strong>?
              <br /><br />
              This will release the slot back to <em>*Available Slot* (Open)</em> for other patients.
            </p>
            <div className="ap-modal-footer">
              <button
                type="button"
                className="ap-btn-pill-ghost"
                onClick={() => setShowDeleteConfirm(false)}
              >
                No, Keep Visit
              </button>
              <button
                type="button"
                className="ap-btn-pill-red"
                onClick={handleConfirmCancel}
              >
                Yes, Cancel & Free Slot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 5: LOGOUT CONFIRMATION
          ========================================================================= */}
      {showLogoutConfirm && (
        <div className="ap-modal-overlay animate-fade" onClick={() => setShowLogoutConfirm(false)}>
          <div className="ap-modal-card animate-zoom" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3 className="ap-modal-title">Sign Out of MedVault</h3>
              <button
                type="button"
                className="ap-modal-close"
                onClick={() => setShowLogoutConfirm(false)}
              >
                ✕
              </button>
            </div>
            <p style={{ color: '#475569', fontSize: '0.92rem', lineHeight: '1.5' }}>
              Are you sure you want to sign out from the Receptionist station?
            </p>
            <div className="ap-modal-footer">
              <button
                type="button"
                className="ap-btn-pill-ghost"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Stay Logged In
              </button>
              <button
                type="button"
                className="ap-btn-pill-cyan"
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

      {/* =========================================================================
          TOAST NOTIFICATION FEEDBACK
          ========================================================================= */}
      {toastMessage && (
        <div className="pm-toast animate-pop-in">
          <span className="pm-toast-icon">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
