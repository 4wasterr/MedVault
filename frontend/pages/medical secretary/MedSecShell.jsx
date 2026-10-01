import React, { useEffect, useRef, useState } from 'react';
import '../receptionist/receptionistDashboard.css';
import './MedSecModules.css';

function navIcon(view, active) {
  if (view === 'dashboard') return <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
  </svg>;
  if (view === 'patients') return <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true">
    <circle cx="10" cy="8" r="4" fill={active ? '#ffffff' : '#00ADEF'} />
    <path d="M2 18c0-3.3 3.6-6 8-6s8 2.7 8 6v1H2v-1z" fill={active ? '#ffffff' : '#00ADEF'} />
    <circle cx="18" cy="17" r="4.5" fill={active ? '#ffffff' : '#00ADEF'} />
    <path d="M18 15v4M16 17h4" stroke={active ? '#00ADEF' : '#ffffff'} strokeWidth="1.8" strokeLinecap="round" />
  </svg>;
  if (view === 'appointments') return <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true">
    <rect x="4" y="5" width="13" height="16" rx="2" fill={active ? '#ffffff' : '#00ADEF'} />
    <rect x="7" y="3" width="7" height="3" rx="1.5" fill={active ? '#ffffff' : '#00ADEF'} />
    <path d="M7 10h5M7 13h5M7 16h3" stroke={active ? '#00ADEF' : '#ffffff'} strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="17.5" cy="16.5" r="3.5" fill={active ? '#00ADEF' : '#ffffff'} stroke={active ? '#ffffff' : '#00ADEF'} strokeWidth="2" />
    <line x1="20" y1="19" x2="22.5" y2="21.5" stroke={active ? '#ffffff' : '#00ADEF'} strokeWidth="2.5" strokeLinecap="round" />
  </svg>;
  return <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
    <rect x="3" y="4" width="18" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M3 9h18M8 2v4M16 2v4" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="15" r="3" />
  </svg>;
}

const navigation = [
  ['dashboard', 'Dashboard'],
  ['patients', 'Patient Records'],
  ['appointments', 'Appointments'],
  ['schedules', 'Doctor Schedules'],
];

export default function MedSecShell({ active, title, subtitle, onNavigate, onLogout, children }) {
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    if (!showProfileMenu) return undefined;

    function closeOnOutsideClick(event) {
      if (!profileRef.current?.contains(event.target)) setShowProfileMenu(false);
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setShowProfileMenu(false);
    }

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showProfileMenu]);

  return (
    <div className="nd-screen-container medsec-screen">
      <div className="nd-dashboard-frame">
        <aside className="nd-sidebar" aria-label="Medical secretary navigation">
          <button type="button" className="nd-sidebar-logo medsec-logo" onClick={() => onNavigate('dashboard')} aria-label="MedVault dashboard">
            <svg viewBox="0 0 46 46" width="46" height="46" fill="none" aria-hidden="true">
              <rect x="17" y="3" width="12" height="40" rx="6" fill="#FF4D4D" />
              <rect x="3" y="17" width="40" height="12" rx="6" fill="#FF4D4D" />
            </svg>
          </button>
          <nav className="nd-sidebar-nav" aria-label="Modules">
            {navigation.map(([view, label]) => (
              <button key={view} type="button" className={`nav-btn ${active === view ? 'active' : ''}`}
                onClick={() => onNavigate(view)} title={label} aria-label={label} aria-current={active === view ? 'page' : undefined}>
                {navIcon(view, active === view)}
              </button>
            ))}
          </nav>
          <div className="nd-sidebar-footer">
            <button type="button" className="power-btn" onClick={() => setConfirmLogout(true)} title="Sign Out" aria-label="Sign Out">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#00ADEF" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" />
              </svg>
            </button>
          </div>
        </aside>
        <main className="nd-workspace medsec-workspace">
          <header className="nd-header medsec-header">
            <div className="header-titles">
              <span className="welcome-receptionist-text">Medical Secretary</span>
              <h1 className="dashboard-main-title">{title}</h1>
              {subtitle && <p className="medsec-subtitle">{subtitle}</p>}
            </div>
            <div className="medsec-role-wrapper" ref={profileRef}>
              <button type="button" className="medsec-role-pill"
                onClick={() => setShowProfileMenu((open) => !open)}
                aria-label="Medical Secretary profile" aria-expanded={showProfileMenu}
                aria-controls="medsec-profile-menu" title="Medical Secretary profile">
                <span className="medsec-role-avatar" aria-hidden="true">M</span>
                <span className="medsec-role-label">On Duty</span>
              </button>
              {showProfileMenu && (
                <div className="avatar-dropdown medsec-profile-menu animate-pop-in" id="medsec-profile-menu">
                  <div className="avatar-nurse-name">Medical Secretary</div>
                  <div className="avatar-duty-tag">● On Duty</div>
                  <button type="button" className="menu-signout-btn" onClick={() => {
                    setShowProfileMenu(false);
                    setConfirmLogout(true);
                  }}>Sign Out</button>
                </div>
              )}
            </div>
          </header>
          {children}
        </main>
      </div>
      {confirmLogout && (
        <div className="medsec-modal-backdrop" role="presentation" onClick={() => setConfirmLogout(false)}>
          <div className="medsec-modal" role="dialog" aria-modal="true" aria-labelledby="medsec-signout-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="medsec-signout-title">Sign out?</h2>
            <p>Your saved records will be available when you return.</p>
            <div className="medsec-actions">
              <button type="button" className="medsec-btn secondary" onClick={() => setConfirmLogout(false)}>Stay</button>
              <button type="button" className="medsec-btn danger" onClick={onLogout}>Sign Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
