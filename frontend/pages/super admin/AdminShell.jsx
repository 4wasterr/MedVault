import React, { useEffect, useRef, useState } from 'react';
import '../receptionist/receptionistDashboard.css';
import '../medical secretary/MedSecModules.css';
import './AdminDashboard.css';

const navigation = [['dashboard', 'Dashboard'], ['users', 'User Management'], ['doctors', 'Doctor Management']];

function Icon({ view }) {
  if (view === 'dashboard') return <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>;
  if (view === 'users') return <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><circle cx="9" cy="8" r="4" /><path d="M1 20c0-4 3-7 8-7s8 3 8 7H1z" /><path d="M17 6a3 3 0 0 1 0 6M19 14c2 1 3 3 3 6h-3" /></svg>;
  return <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 3v18M3 12h18" /><circle cx="12" cy="12" r="9" /><path d="M8 8h8M8 16h8" /></svg>;
}

export default function AdminShell({ active, title, subtitle, onNavigate, onLogout, children }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const profileRef = useRef(null);
  useEffect(() => {
    if (!profileOpen) return undefined;
    const closeOutside = (event) => { if (!profileRef.current?.contains(event.target)) setProfileOpen(false); };
    const closeEscape = (event) => { if (event.key === 'Escape') setProfileOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape); };
  }, [profileOpen]);
  return <div className="nd-screen-container medsec-screen admin-screen">
    <div className="nd-dashboard-frame">
      <aside className="nd-sidebar" aria-label="Super Admin navigation">
        <button type="button" className="nd-sidebar-logo medsec-logo" onClick={() => onNavigate('dashboard')} aria-label="MedVault dashboard">
          <svg viewBox="0 0 46 46" width="46" height="46" fill="none" aria-hidden="true"><rect x="17" y="3" width="12" height="40" rx="6" fill="#FF4D4D" /><rect x="3" y="17" width="40" height="12" rx="6" fill="#FF4D4D" /></svg>
        </button>
        <nav className="nd-sidebar-nav" aria-label="Modules">{navigation.map(([view, label]) => <button key={view} type="button"
          className={`nav-btn ${active === view ? 'active' : ''}`} onClick={() => onNavigate(view)}
          title={label} aria-label={label} aria-current={active === view ? 'page' : undefined}><Icon view={view} /></button>)}</nav>
        <div className="nd-sidebar-footer"><button type="button" className="power-btn" onClick={() => setConfirmLogout(true)} title="Sign Out" aria-label="Sign Out">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#00ADEF" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></svg>
        </button></div>
      </aside>
      <main className="nd-workspace medsec-workspace">
        <header className="nd-header medsec-header"><div className="header-titles"><span className="welcome-receptionist-text">Super Admin</span>
          <h1 className="dashboard-main-title">{title}</h1>{subtitle && <p className="medsec-subtitle">{subtitle}</p>}</div>
          <div className="medsec-role-wrapper" ref={profileRef}><button type="button" className="medsec-role-pill" onClick={() => setProfileOpen((open) => !open)}
            aria-expanded={profileOpen} aria-label="Super Admin profile"><span className="medsec-role-avatar">A</span><span className="medsec-role-label">On Duty</span></button>
            {profileOpen && <div className="avatar-dropdown medsec-profile-menu animate-pop-in"><div className="avatar-nurse-name">Super Admin</div>
              <div className="avatar-duty-tag">● On Duty</div><button type="button" className="menu-signout-btn" onClick={() => { setProfileOpen(false); setConfirmLogout(true); }}>Sign Out</button></div>}</div>
        </header>{children}
      </main>
    </div>
    {confirmLogout && <div className="medsec-modal-backdrop" role="presentation" onClick={() => setConfirmLogout(false)}><div className="medsec-modal" role="dialog" aria-modal="true" aria-labelledby="admin-signout-title" onClick={(event) => event.stopPropagation()}>
      <h2 id="admin-signout-title">Sign out?</h2><p>Your changes are saved on the shared server.</p><div className="medsec-actions"><button type="button" className="medsec-btn secondary" onClick={() => setConfirmLogout(false)}>Stay</button><button type="button" className="medsec-btn danger" onClick={onLogout}>Sign Out</button></div>
    </div></div>}
  </div>;
}
