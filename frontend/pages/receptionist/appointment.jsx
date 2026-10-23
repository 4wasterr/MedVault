import React, { useState, useEffect } from 'react';
import './receptionistDashboard.css';
import './appointment.css';
import { useDraftState } from '../../client/src/useDraftState';
import { useCurrentUser } from '../../client/src/currentUser';
import AppointmentBookingFields from '../components/AppointmentBookingFields';
import { PHONE_PATTERN, RELATIONSHIPS, SPECIALTIES, VISIT_TYPES, ROOMS, normalizeRoom, demographicsProblem, normalizeVisitType, formatPhone, phoneInput, specialtyLabel } from '../../shared/formRules.mjs';
import { bookingPatient, selectBookingPatient, updatePatientBooking, doctorSpecialty, appointmentSpecialty, appointmentStatusClass, duplicateBookingPatient } from '../../client/src/appointmentBooking';
import { duplicatePatientMessage } from '../../shared/patientIdentity.mjs';
import { appointmentStage, canUndoCheckIn } from '../../shared/appointmentWorkflow.mjs';
import { isBookingUnavailable, createRecordId, dateKey, displayDate, displayTime, timeKey, todayISO } from '../medical secretary/medsecData';
import { validateBooking, validateContactDetails } from '../medical secretary/medsecData';

const canModifyBooking = (appointment) => ['Confirmed', 'Checked-In', 'Waiting'].includes(appointmentStage(appointment));
const unavailableTimeMessage = 'That time is booked or blocked in Doctor Schedules. Choose another available time.';


export default function Appointment({
  onNavigate,
  onLogout,
  patients = [],
  setPatients,
  appointments: sharedAppointments,
  setAppointments: setSharedAppointments,
  schedules = {},
  doctors = [],
  onRecordView,
  role = 'Receptionist',
}) {
  const profile = useCurrentUser(role);
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const currentDate = displayDate(selectedDate);

  const [localAppointments, setLocalAppointments] = useState([]);
  const appointments = sharedAppointments ?? localAppointments;
  const activeDoctorNames = doctors.filter((doctor) => doctor.active).map((doctor) => doctor.name);
  const doctorNames = [...new Set([...activeDoctorNames, ...appointments.map((item) => item.doctor).filter(Boolean)])];
  const setAppointments = setSharedAppointments ?? setLocalAppointments;

  const unavailable = (doctor, date, time, excludeId) => isBookingUnavailable(schedules, appointments, doctor, date, time, excludeId);

  const [selectedAppointment, setSelectedAppointment] = useDraftState('appointments:selectedAppointment', null);

  // Detail card active tab: 'apptInfo' | 'patientInfo' | 'notes'
  const [activeTab, setActiveTab] = useDraftState('appointments:activeTab', 'apptInfo');
  const selectedId = selectedAppointment?.id;
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled && selectedId) void onRecordView?.('appointments', selectedId, activeTab); });
    return () => { cancelled = true; };
  }, [selectedId, activeTab, onRecordView]);

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
  const [notifications, setNotifications] = useState([]);

  // Inline editing states for Tab 3 (Clinical Notes)
  const [isEditingNotes, setIsEditingNotes] = useDraftState('appointments:isEditingNotes', false);
  const [editedNotesText, setEditedNotesText] = useDraftState('appointments:editedNotesText', '');

  // Inline editing states for Tab 2 (Patient Details)
  const [isEditingPatientInfo, setIsEditingPatientInfo] = useDraftState('appointments:isEditingPatientInfo', false);
  const [patientEditForm, setPatientEditForm] = useDraftState('appointments:patientEditForm', {
    contact: '',
    address: '',
    emergencyName: '',
    emergencyContact: '',
    emergencyRelationship: '',
  });

  // Modals
  const [showNewModal, setShowNewModal] = useDraftState('appointments:showNewModal', false);
  const [showEditModal, setShowEditModal] = useDraftState('appointments:showEditModal', false);
  const [showBookSlotModal, setShowBookSlotModal] = useDraftState('appointments:showBookSlotModal', false);
  const [targetSlot, setTargetSlot] = useDraftState('appointments:targetSlot', null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState('');
  const [newBookingAttempted, setNewBookingAttempted] = useState(false);
  const [slotBookingAttempted, setSlotBookingAttempted] = useState(false);
  const [bookingConflict, setBookingConflict] = useState('');
  useEffect(() => {
    if (!selectedAppointment || showEditModal || isEditingNotes || isEditingPatientInfo) return undefined;
    const latest = appointments.find((item) => item.id === selectedAppointment.id);
    if (!latest || JSON.stringify(latest) === JSON.stringify(selectedAppointment)) return undefined;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setSelectedAppointment(latest); });
    return () => { cancelled = true; };
  }, [appointments, selectedAppointment, showEditModal, isEditingNotes, isEditingPatientInfo]);

  // Form states for New Appointment
  const [newForm, setNewForm] = useDraftState('appointments:newForm', {
    patientId: '',
    patientName: '',
    date: todayISO(),
    time: '',
    type: 'Routine Checkup', age: '', emergencyName: '', emergencyContact: '', emergencyRelationship: '',
    specialty: doctorSpecialty(doctors.find(doctor => doctor.name === activeDoctorNames[0])),
    doctor: activeDoctorNames[0] || '',
    room: 'Room 1',
    contact: '',
    notes: '',
  });

  // Form state for Editing Appointment
  const [editForm, setEditForm] = useDraftState('appointments:editForm', {});
  const [editOriginal, setEditOriginal] = useDraftState('appointments:editOriginal', null);

  // Form state for Booking an Available Slot
  const [bookForm, setBookForm] = useDraftState('appointments:bookForm', {
    patientId: '',
    patientName: '',
    contact: '',
    type: 'Routine Checkup', age: '', emergencyName: '', emergencyContact: '', emergencyRelationship: '',
    specialty: doctorSpecialty(doctors.find(doctor => doctor.name === activeDoctorNames[0])),
    doctor: activeDoctorNames[0] || '',
    notes: '',
  });

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      for (const [open, form, setForm, slot] of [[showNewModal, newForm, setNewForm], [showBookSlotModal, bookForm, setBookForm, targetSlot]]) {
        const patient = patients.find(item => item.id === form.patientId);
        const restorePatient = open && patient && !form.patientName;
        const restoreSlot = open && slot?.doctor && (form.doctor !== slot.doctor || appointmentSpecialty(form, doctors) !== appointmentSpecialty(slot, doctors));
        if (restorePatient || restoreSlot) setForm(current => ({
          ...(restorePatient ? selectBookingPatient(current, patient) : current),
          ...(restoreSlot ? { doctor: slot.doctor, specialty: appointmentSpecialty(slot, doctors) } : {}),
        }));
      }
    });
    return () => { cancelled = true; };
  }, [showNewModal, showBookSlotModal, newForm.patientId, newForm.patientName, bookForm.patientId, bookForm.patientName, bookForm.doctor, bookForm.specialty, targetSlot, patients, doctors]);

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
  const dayAppointments = appointments.filter((appt) => dateKey(appt.date) === selectedDate);
  const filteredAppointments = dayAppointments.filter((appt) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || [appt.patientName, appt.time, appt.type, appt.doctor,
      appt.room, appt.notes, appt.patientId, specialtyLabel(appointmentSpecialty(appt, doctors)), formatPhone(appt.contact)]
      .some(value => String(value ?? '').toLowerCase().includes(q));

    const matchesFilter =
      activeFilter === 'All' ||
      String(appt.status || '').toLowerCase() === activeFilter.toLowerCase();

    const matchesDoctor =
      selectedDoctor === 'All' ||
      String(appt.doctor || '').toLowerCase() === selectedDoctor.toLowerCase();

    const matchesRoom =
      selectedRoom === 'All' ||
      normalizeRoom(appt.room).toLowerCase() === selectedRoom.toLowerCase();

    return matchesSearch && matchesFilter && matchesDoctor && matchesRoom;
  });

  // Calendar stats computation
  const totalSlotsCount = dayAppointments.length;
  const confirmedCount = dayAppointments.filter((a) => a.status === 'Confirmed').length;
  const checkedInCount = dayAppointments.filter((a) => a.status === 'Checked-In').length;
  const openSlotsCount = dayAppointments.filter((a) => a.status === 'Open').length;

  // Action: Check-in patient
  const handleCheckIn = (apptId) => {
    const target = appointments.find((a) => a.id === apptId);
    if (appointmentStage(target) !== 'Confirmed') {
      showToast('Only confirmed appointments can be checked in.');
      return;
    }
    setAppointments((prev) =>
      prev.map((a) => (a.id === apptId ? { ...a, status: 'Checked-In' } : a))
    );
    if (selectedAppointment && selectedAppointment.id === apptId) {
      setSelectedAppointment((prev) => ({ ...prev, status: 'Checked-In' }));
    }
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
    const target = appointments.find((a) => a.id === apptId);
    if (!canUndoCheckIn(target)) {
      showToast('Check-in can only be undone before consultation starts.');
      return;
    }
    setAppointments((prev) =>
      prev.map((a) => (a.id === apptId ? { ...a, status: 'Confirmed' } : a))
    );
    if (selectedAppointment && selectedAppointment.id === apptId) {
      setSelectedAppointment((prev) => ({ ...prev, status: 'Confirmed' }));
    }
    showToast('Status reverted to Confirmed.');
  };

  // Action: Book Available Slot
  const handleOpenBookSlot = (slot) => {
    setTargetSlot(slot);
    setBookForm({
      patientId: '',
      patientName: '',
      contact: '',
      type: normalizeVisitType(slot.type), age: '', emergencyName: '', emergencyContact: '', emergencyRelationship: '',
      specialty: appointmentSpecialty(slot, doctors),
      doctor: slot.doctor || activeDoctorNames[0] || '',
      notes: '',
    });
    setSlotBookingAttempted(false);
    setBookingConflict('');
    setShowBookSlotModal(true);
  };

  const bookingIssue = (form, slot) => {
    if (form.patientId && !patients.some(patient => patient.id === form.patientId)) return 'This patient is no longer available. Select a patient again.';
    const duplicate = duplicateBookingPatient(form, patients);
    if (duplicate) return duplicatePatientMessage(duplicate);
    const doctor = doctors.find(item => item.active && item.name === form.doctor);
    if (!doctor || doctorSpecialty(doctor) !== appointmentSpecialty(form, doctors)) return 'Choose an active doctor for the selected specialty.';
    const problem = validateBooking({ ...form, ...(slot ? { date: slot.date, time: slot.time } : {}) });
    if (problem) return problem;
    if (unavailable(form.doctor, slot?.date || form.date, slot?.time || form.time, slot?.id)) return unavailableTimeMessage;
    const patient = bookingPatient(form, patients.find(item => item.id === form.patientId));
    return demographicsProblem({ ...patient, birthday: dateKey(patient.birthday) });
  };

  const revealBooking = (appointment) => {
    setSelectedDate(dateKey(appointment.date));
    setSearchQuery('');
    setActiveFilter('All');
    setSelectedDoctor('All');
    setSelectedRoom('All');
    setActiveTab('apptInfo');
    setSelectedAppointment(appointment);
    setIsEditingPatientInfo(false);
    setIsEditingNotes(false);
    setBookingConflict('');
  };

  const liveNewBookingIssue = bookingIssue(newForm);
  const liveSlotBookingIssue = targetSlot ? bookingIssue(bookForm, targetSlot) : null;
  const newBookingFeedback = bookingConflict || ((newBookingAttempted || liveNewBookingIssue === unavailableTimeMessage) ? liveNewBookingIssue : '');
  const slotBookingFeedback = bookingConflict || ((slotBookingAttempted || liveSlotBookingIssue === unavailableTimeMessage) ? liveSlotBookingIssue : '');

  const handleBookSlotSubmit = (e) => {
    e.preventDefault();
    setSlotBookingAttempted(true);
    if (liveSlotBookingIssue) return;
    if (JSON.stringify(appointments.find((item) => item.id === targetSlot?.id) || null) !== JSON.stringify(targetSlot)) {
      setBookingConflict('This slot changed in another session. Reopen it to review the latest details.'); return;
    }

    const matchedPatient = patients.find((patient) => patient.id === bookForm.patientId);
    const patient = bookingPatient(bookForm, matchedPatient, createRecordId('PTNT'));

    const updatedAppt = {
      ...targetSlot,
      patientId: patient.id,
      patientName: patient.name,
      age: patient.age, sex: patient.sex,
      contact: patient.contact,
      address: patient.address || '',
      emergencyName: patient.emergencyName || '',
      emergencyContact: patient.emergencyContact || '', emergencyRelationship: patient.emergencyRelationship || '',
      type: bookForm.type,
      specialty: appointmentSpecialty(bookForm, doctors),
      doctor: bookForm.doctor,
      status: 'Confirmed',
      notes: bookForm.notes || `Appointment booked by ${role}.`,
    };

    setAppointments((prev) =>
      prev.map((a) => (a.id === targetSlot.id ? updatedAppt : a))
    );
    if (setPatients) setPatients(current => updatePatientBooking(current, patient, updatedAppt));
    revealBooking(updatedAppt);
    setShowBookSlotModal(false);
    showToast(`Booked ${targetSlot.time} for ${bookForm.patientName}!`);
  };

  // Action: Create New Appointment
  const handleNewSubmit = (e) => {
    e.preventDefault();
    setNewBookingAttempted(true);
    if (liveNewBookingIssue) return;

    const matchedPatient = patients.find((patient) => patient.id === newForm.patientId);
    const patient = bookingPatient(newForm, matchedPatient, createRecordId('PTNT'));

    const newApptObj = {
      id: createRecordId('APPT'),
      time: displayTime(newForm.time),
      patientId: patient.id,
      patientName: patient.name,
      age: patient.age, sex: patient.sex,
      contact: patient.contact,
      address: patient.address || '',
      emergencyName: patient.emergencyName || '',
      emergencyContact: patient.emergencyContact || '',
      emergencyRelationship: patient.emergencyRelationship || '',
      type: newForm.type,
      specialty: appointmentSpecialty(newForm, doctors),
      doctor: newForm.doctor,
      room: normalizeRoom(newForm.room),
      date: newForm.date,
      status: 'Confirmed',
      notes: newForm.notes || 'New intake appointment scheduled.',
    };

    setAppointments((prev) => [newApptObj, ...prev]);
    if (setPatients) setPatients(current => updatePatientBooking(current, patient, newApptObj));
    revealBooking(newApptObj);
    setShowNewModal(false);
    setNewBookingAttempted(false);
    setNewForm({
      patientId: '',
      patientName: '',
      date: todayISO(),
      time: '',
      type: 'Routine Checkup', age: '', emergencyName: '', emergencyContact: '', emergencyRelationship: '',
      specialty: doctorSpecialty(doctors.find(doctor => doctor.name === activeDoctorNames[0])),
      doctor: activeDoctorNames[0] || '',
      room: 'Room 1',
      contact: '',
      notes: '',
    });
    showToast(`Appointment booked for ${newApptObj.patientName}!`);
  };

  // Action: Open Edit Modal
  const handleOpenEdit = (appt) => {
    if (!canModifyBooking(appt)) { showToast('Only active appointments can be rescheduled.'); return; }
    setEditForm({ ...appt, date: dateKey(appt.date), time: timeKey(appt.time), type: normalizeVisitType(appt.type), specialty: appointmentSpecialty(appt, doctors) });
    setEditOriginal(appt);
    setShowEditModal(true);
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (JSON.stringify(appointments.find((item) => item.id === editForm.id) || null) !== JSON.stringify(editOriginal)) {
      showToast('This appointment changed in another session. Reopen it before saving.'); return;
    }
    const bookingProblem = validateBooking(editForm);
    if (bookingProblem) { showToast(bookingProblem); return; }
    if (appointmentSpecialty(editForm, doctors) !== doctorSpecialty(doctors.find(doctor => doctor.name === editForm.doctor))) {
      showToast('Choose a doctor for the selected specialty.'); return;
    }
    if (unavailable(editForm.doctor, editForm.date, editForm.time, editForm.id)) {
      showToast('That slot is booked or blocked in Doctor Schedules.'); return;
    }
    setAppointments((prev) =>
      prev.map((a) => (a.id === editForm.id ? { ...editForm, room: normalizeRoom(editForm.room) } : a))
    );
    if (setPatients && editForm.patientId) setPatients((items) => items.map((patient) => patient.id === editForm.patientId ? {
      ...patient, appointments: (patient.appointments || []).map((entry) => entry.sourceAppointmentId === editForm.id
        ? { ...entry, date: editForm.date, doctor: editForm.doctor, type: editForm.type, specialty: editForm.specialty } : entry),
    } : patient));
    if (selectedAppointment && selectedAppointment.id === editForm.id) {
      setSelectedAppointment({ ...editForm, room: normalizeRoom(editForm.room) });
    }
    setSelectedDate(dateKey(editForm.date));
    setShowEditModal(false);
    showToast('Appointment updated successfully!');
  };

  // Action: Cancel / Free appointment
  const handleConfirmCancel = () => {
    if (!deleteTarget) return;
    if (!['Confirmed', 'Checked-In', 'Waiting'].includes(deleteTarget.status)) {
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
      showToast('Only active waiting or confirmed appointments can be cancelled.');
      return;
    }
    if (JSON.stringify(appointments.find((item) => item.id === deleteTarget.id) || null) !== JSON.stringify(deleteTarget)) {
      setShowDeleteConfirm(false);
      showToast('This appointment changed in another session. Review it before cancelling.');
      return;
    }

    // Retain the cancelled booking and create a separate available slot.
    const freedSlot = {
      ...deleteTarget,
      id: createRecordId('APPT'),
      patientId: null,
      patientName: '*Available Slot*',
      age: null,
      sex: null,
      contact: '',
      address: '',
      emergencyName: '',
      emergencyContact: '',
      emergencyRelationship: '',
      status: 'Open',
      notes: 'Slot freed upon cancellation.',
    };

    const cancelled = { ...deleteTarget, status: 'Cancelled',
      cancelledAt: new Date().toISOString(), cancellationNote: 'Cancelled by receptionist.' };

    setAppointments((prev) =>
      [freedSlot, ...prev.map((a) => (a.id === deleteTarget.id ? cancelled : a))]
    );
    if (setPatients && deleteTarget.patientId) setPatients((items) => items.map((patient) => patient.id === deleteTarget.patientId ? {
      ...patient, appointments: (patient.appointments || []).map((entry) => entry.sourceAppointmentId === deleteTarget.id
        ? { ...entry, status: 'Cancelled' } : entry),
    } : patient));
    if (selectedAppointment && selectedAppointment.id === deleteTarget.id) {
      setSelectedAppointment(cancelled);
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
    if (JSON.stringify(appointments.find((item) => item.id === selectedAppointment.id) || null) !== JSON.stringify(selectedAppointment)) {
      showToast('This appointment changed in another session. Reopen it before saving notes.'); return;
    }
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
      emergencyContact: selectedAppointment.emergencyContact || '', emergencyRelationship: selectedAppointment.emergencyRelationship || '',
    });
    setIsEditingPatientInfo(true);
  };

  const handleSavePatientInfo = () => {
    if (!selectedAppointment) return;
    if (JSON.stringify(appointments.find((item) => item.id === selectedAppointment.id) || null) !== JSON.stringify(selectedAppointment)) {
      showToast('This appointment changed in another session. Reopen it before saving.'); return;
    }
    const contactProblem = validateContactDetails(patientEditForm);
    if (contactProblem) { showToast(contactProblem); return; }
    const updated = {
      ...selectedAppointment,
      contact: formatPhone(patientEditForm.contact),
      address: patientEditForm.address,
      emergencyName: patientEditForm.emergencyName,
      emergencyContact: formatPhone(patientEditForm.emergencyContact), emergencyRelationship: patientEditForm.emergencyRelationship,
    };
    setAppointments((prev) =>
      prev.map((a) => (a.id === selectedAppointment.id ? updated : a))
    );
    if (setPatients && updated.patientId) setPatients((items) => items.map((patient) => patient.id === updated.patientId ? {
      ...patient, contact: updated.contact, address: updated.address,
      emergencyName: updated.emergencyName, emergencyContact: updated.emergencyContact, emergencyRelationship: updated.emergencyRelationship,
    } : patient));
    setSelectedAppointment(updated);
    setIsEditingPatientInfo(false);
    showToast('Patient contact details saved!');
  };

  // Interactive Date cycler
  const shiftDay = (days) => {
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() + days);
    const next = dateKey(date);
    setSelectedDate(next);
    setSelectedAppointment(null);
    showToast(`Viewing ${displayDate(next)} schedule`);
  };
  const handlePrevDay = () => shiftDay(-1);
  const handleNextDay = () => shiftDay(1);

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
              title={role === 'Medical Secretary' ? 'Patient Records' : 'Patients Module'}
              aria-label={role === 'Medical Secretary' ? 'Patient Records' : 'Patients Module'}
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
                <span className="ap-role-tag">Role: {role}</span>
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
                    {!notifications.length && <div className="ap-notif-item">No notifications yet.</div>}
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
                  title={`${profile.displayName} · ${profile.role}`}
                  aria-label="Profile"
                >
                  <span>{profile.initials}</span>
                </button>

                {showProfileMenu && (
                  <div className="avatar-dropdown animate-pop-in" style={{ minWidth: '200px' }}>
                    <div className="avatar-nurse-name">{profile.displayName}</div>
                    <div>{profile.username && `@${profile.username}`} · {profile.role}</div>
                    <div className="ap-duty-toggle-row">
                      <span className={`ap-duty-badge ${isOnDuty ? 'on-duty' : 'on-break'}`}>
                        {isOnDuty ? '● On Duty' : '○ On Break'}
                      </span>
                      <button
                        type="button"
                        className="ap-duty-switch-btn"
                        onClick={() => {
                          setIsOnDuty(!isOnDuty);
                          showToast(isOnDuty ? `${role} marked On Break` : `${role} marked On Duty`);
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
                          <label className="ap-dropdown-label" htmlFor="appointment-status-filter">Filter by Status</label>
                          <select id="appointment-status-filter" className="ap-dropdown-select" value={activeFilter} onChange={event => setActiveFilter(event.target.value)}>
                            {['All', 'Confirmed', 'Checked-In', 'Waiting', 'In Consultation', 'Completed', 'Open', 'Cancelled'].map(status => <option key={status}>{status}</option>)}
                          </select>
                        </div>

                        <div className="ap-dropdown-section">
                          <label className="ap-dropdown-label">Filter by Doctor</label>
                          <select
                            className="ap-dropdown-select"
                            value={selectedDoctor}
                            onChange={(e) => setSelectedDoctor(e.target.value)}
                          >
                            <option value="All">All Doctors</option>
                            {doctorNames.map((doctor) => <option key={doctor} value={doctor}>{doctor}</option>)}
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
                            {ROOMS.map(room => <option key={room}>{room}</option>)}
                          </select>
                        </div>

                        <div className="ap-dropdown-actions">
                          <button
                            type="button"
                            className="ap-dropdown-reset-btn"
                            onClick={() => {
                              setSelectedDoctor('All');
                              setSelectedRoom('All');
                              setActiveFilter('All');
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
                        <button
                          type="button"
                          className="clickable"
                          onClick={() => setShowDatePicker(!showDatePicker)}
                          title="Click to jump to date"
                          style={{ cursor: 'pointer', border: 0, background: 'transparent', font: 'inherit', color: 'inherit' }}
                        >
                          DATE: <strong>{currentDate}</strong> ▾
                        </button>
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
                          <input type="date" className="ap-form-input" value={selectedDate}
                            aria-label="Schedule date" onChange={(event) => {
                              setSelectedDate(event.target.value);
                              setSelectedAppointment(null);
                              setShowDatePicker(false);
                            }} />
                          <button type="button" className="ap-picker-item" onClick={() => {
                            setSelectedDate(todayISO()); setSelectedAppointment(null); setShowDatePicker(false);
                          }}>Today</button>
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
                          ROOM: <strong>{selectedRoom === 'All' ? 'All Rooms' : selectedRoom}</strong> ▾
                        </span>
                      </div>

                      {showRoomPicker && (
                        <div className="ap-picker-dropdown animate-pop-in">
                          <span style={{ fontSize: '0.74rem', color: '#64748B', padding: '2px 8px', fontWeight: 600 }}>
                            Room Filter:
                          </span>
                          {['All Rooms', ...ROOMS].map((rm) => (
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
                                {formatPhone(appt.contact) || 'No contact'}
                              </span>
                            )}
                          </div>

                          {/* Type & Doctor Column */}
                          <div className="ap-col-type">
                            <span className="ap-type-title">{appt.type}</span>
                            <span className="ap-type-doc">{specialtyLabel(appointmentSpecialty(appt, doctors))}</span>
                            <span className="ap-type-doc">{appt.doctor}</span>
                          </div>

                          {/* Status Badge */}
                          <div className="ap-col-status">
                            <span
                              className={`ap-badge ${appointmentStatusClass(appt.status)}`}
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
                            ) : canModifyBooking(appt) ? (
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
                            ) : null}
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
                                className={`ap-badge ${appointmentStatusClass(appt.status)}`}
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
                              ) : canModifyBooking(appt) ? (
                                <>
                                  {appt.status === 'Confirmed' && (
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
                              ) : null}
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
                          <span className="ap-info-lbl">Visit specialty</span>
                          <span className="ap-info-val">{specialtyLabel(appointmentSpecialty(selectedAppointment, doctors))}</span>
                        </div>

                        <div className="ap-info-item">
                          <span className="ap-info-lbl">Current Status</span>
                          <span className="ap-info-val">
                            <span
                              className={`ap-badge ${appointmentStatusClass(selectedAppointment.status)}`}
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
                        ) : canModifyBooking(selectedAppointment) ? (
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

                            {selectedAppointment.status === 'Confirmed' ? (
                              <button
                                type="button"
                                className="ap-btn-pill-green"
                                onClick={() => handleCheckIn(selectedAppointment.id)}
                              >
                                Check-In
                              </button>
                            ) : canUndoCheckIn(selectedAppointment) ? (
                              <button
                                type="button"
                                className="ap-btn-pill-ghost"
                                onClick={() => handleRevertStatus(selectedAppointment.id)}
                                title="Click to undo check-in"
                              >
                                Undo Check-In
                              </button>
                            ) : null}

                            <button
                              type="button"
                              className="ap-btn-pill-cyan"
                              onClick={() => handleOpenEdit(selectedAppointment)}
                            >
                              Edit
                            </button>
                          </>
                        ) : null}
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
                            <label className="ap-inline-label">Contact Number *</label>
                            <input
                              type="tel" required pattern={PHONE_PATTERN} maxLength="16" placeholder="+63 917 123 4567"
                              className="ap-inline-input"
                              value={formatPhone(patientEditForm.contact)}
                              onChange={(e) => setPatientEditForm({ ...patientEditForm, contact: phoneInput(e.target.value) })}
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

                          <fieldset className="ap-emergency-contact-fields">
                            <legend>Emergency contact information</legend>
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
                              <label className="ap-inline-label">Emergency Phone *</label>
                              <input
                                type="tel" required pattern={PHONE_PATTERN} maxLength="16" placeholder="+63 917 123 4567"
                                className="ap-inline-input"
                                value={formatPhone(patientEditForm.emergencyContact)}
                                onChange={(e) => setPatientEditForm({ ...patientEditForm, emergencyContact: phoneInput(e.target.value) })}
                              />
                            </div>
                            <label className="ap-inline-field"><span className="ap-inline-label">Relationship *</span><select className="ap-inline-input" required value={patientEditForm.emergencyRelationship || ''} onChange={e => setPatientEditForm({ ...patientEditForm, emergencyRelationship: e.target.value })}><option value="">Select relationship</option>{RELATIONSHIPS.map(item => <option key={item}>{item}</option>)}</select></label>
                            </div>
                          </fieldset>

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
                            <span className="ap-info-val">{selectedAppointment.patientId || 'Not recorded'}</span>
                          </div>

                          <div className="ap-info-item">
                            <span className="ap-info-lbl">Age / Sex</span>
                            <span className="ap-info-val">
                              {selectedAppointment.age !== '' && selectedAppointment.age != null ? `${selectedAppointment.age} years old` : 'Age not recorded'} | {selectedAppointment.sex || 'Sex not recorded'}
                            </span>
                          </div>

                          <div className="ap-info-item">
                            <span className="ap-info-lbl">Contact Number</span>
                            <span className="ap-info-val">{formatPhone(selectedAppointment.contact) || 'Not recorded'}</span>
                          </div>

                          <div className="ap-info-item full-width">
                            <span className="ap-info-lbl">Home Address</span>
                            <span className="ap-info-val">{selectedAppointment.address || 'Not recorded'}</span>
                          </div>

                          <div className="ap-info-item full-width">
                            <span className="ap-info-lbl">Emergency Contact</span>
                            <span className="ap-info-val">
                              {[selectedAppointment.emergencyName, formatPhone(selectedAppointment.emergencyContact), selectedAppointment.emergencyRelationship].filter(Boolean).join(' • ') || 'None listed'}
                            </span>
                          </div>
                        </div>
                      )}

                      {selectedAppointment.status === 'Open' && <div className="ap-card-actions">
                          <button
                            type="button"
                            className="ap-btn-pill-cyan"
                            onClick={() => handleOpenBookSlot(selectedAppointment)}
                          >
                            Book Slot
                          </button>
                      </div>}
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
                            <span className="ap-info-lbl">{role} Intake Notes</span>
                            <span className="ap-info-val">{selectedAppointment.notes}</span>
                          </div>

                          <div className="ap-info-item">
                            <span className="ap-info-lbl">Booking Timestamp</span>
                            <span className="ap-info-val">Recorded on {selectedAppointment.date}</span>
                          </div>

                          <div className="ap-info-item">
                            <span className="ap-info-lbl">Authorization</span>
                            <span className="ap-info-val">{role}</span>
                          </div>
                        </div>
                      )}

                      {canModifyBooking(selectedAppointment) && <div className="ap-card-actions">
                        <button
                          type="button"
                          className="ap-btn-pill-ghost"
                          onClick={() => handleOpenEdit(selectedAppointment)}
                        >
                          Edit Full Appointment
                        </button>
                      </div>}
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
          <div className="ap-modal-card animate-zoom" role="dialog" aria-modal="true" aria-label="New Appointment" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h3 className="ap-modal-title">New Appointment</h3>
              <button
                type="button"
                className="ap-modal-close"
                onClick={() => setShowNewModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleNewSubmit} className="ap-booking-form" onInvalid={() => setNewBookingAttempted(true)}>
              <AppointmentBookingFields form={newForm} setForm={setNewForm} patients={patients} doctors={doctors} />
              {newBookingFeedback && <p className="ap-form-error" role="alert">{newBookingFeedback}</p>}
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
          <div className="ap-modal-card animate-zoom" role="dialog" aria-modal="true" aria-label="Book Appointment" onClick={(e) => e.stopPropagation()}>
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

            <form onSubmit={handleBookSlotSubmit} className="ap-booking-form" onInvalid={() => setSlotBookingAttempted(true)}>
              <AppointmentBookingFields form={bookForm} setForm={setBookForm} patients={patients} doctors={doctors} slot={targetSlot} />
              {slotBookingFeedback && <p className="ap-form-error" role="alert">{slotBookingFeedback}</p>}
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
                <label className="ap-form-field"><span className="ap-form-label">Date *</span><input type="date" required min={todayISO()} className="ap-form-input" value={dateKey(editForm.date)} onChange={e => setEditForm({ ...editForm, date: e.target.value })} /></label>

                <div className="ap-form-field">
                  <label className="ap-form-label">Patient Name</label>
                  <input
                    type="text"
                    required
                    className="ap-form-input"
                    value={editForm.patientName}
                    readOnly={Boolean(editForm.patientId)}
                    onChange={(e) => setEditForm({ ...editForm, patientName: e.target.value })}
                  />
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Time</label>
                  <input type="time" step="60" required className="ap-form-input" value={timeKey(editForm.time)} onChange={e => setEditForm({ ...editForm, time: e.target.value })} />

                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Doctor</label>
                  <select
                    className="ap-form-select"
                    value={editForm.doctor}
                    onChange={(e) => setEditForm({ ...editForm, doctor: e.target.value })}
                  >
                    <option value="">Select doctor</option>
                    {doctorNames.filter(name => doctorSpecialty(doctors.find(doctor => doctor.name === name)) === appointmentSpecialty(editForm, doctors))
                      .map((doctor) => <option key={doctor} value={doctor}>{doctor}</option>)}
                  </select>
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Room</label>
                  <select
                    className="ap-form-select"
                    value={normalizeRoom(editForm.room)}
                    onChange={(e) => setEditForm({ ...editForm, room: e.target.value })}
                  >
                    {ROOMS.map(room => <option key={room}>{room}</option>)}
                  </select>
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Status</label>
                  <select
                    className="ap-form-select"
                    value={editForm.status}
                    disabled={appointmentStage(editOriginal) !== 'Confirmed' && !canUndoCheckIn(editOriginal)}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  >
                    {appointmentStage(editOriginal) === 'Confirmed' || canUndoCheckIn(editOriginal) ? <><option value="Confirmed">Confirmed</option><option value="Checked-In">Checked-In</option></>
                      : <option value={editOriginal?.status}>{editOriginal?.status}</option>}
                  </select>
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Visit specialty *</label>
                  <select aria-label="Visit specialty" required className="ap-form-select" value={appointmentSpecialty(editForm, doctors)} onChange={event => {
                    const specialty = event.target.value;
                    setEditForm({ ...editForm, specialty, doctor: doctors.find(doctor => doctor.active && doctorSpecialty(doctor) === specialty)?.name || '' });
                  }}>{SPECIALTIES.map(item => <option key={item} value={item}>{specialtyLabel(item)}</option>)}</select>
                </div>

                <div className="ap-form-field">
                  <label className="ap-form-label">Appointment Type</label>
                  <select
                    className="ap-form-select"
                    value={editForm.type}
                    onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                  >
                    {VISIT_TYPES.map(item => <option key={item}>{item}</option>)}
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
              Are you sure you want to sign out from the {role} station?
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
