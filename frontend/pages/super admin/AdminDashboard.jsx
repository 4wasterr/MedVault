import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../client/src/sharedState';
import { dateKey } from '../medical secretary/medsecData';
import AdminShell from './AdminShell';
import AdminUserManagement from './AdminUserManagement';
import AdminDoctorManagement from './AdminDoctorManagement';

const periods = ['Weekly', 'Quarterly', 'Annually'];
function KpiIcon({ label, color }) {
  if (label === 'Staff Accounts' || label === 'Patients') return <span className="kpi-symbol"><svg viewBox="0 0 24 24" width="30" height="30" fill={color} aria-hidden="true">
    <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zM8 11c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
  </svg></span>;
  if (label === 'Doctors') return <span className="kpi-symbol"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M7 12h10" /></svg></span>;
  return <span className="kpi-symbol"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="18" rx="2" /><path d="M8 2h8M8 10h8M8 14h8M8 18h5" /></svg></span>;
}
function chartData(bookings, period) {
  const now = new Date();
  if (period === 'Weekly') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return { label: date.toLocaleDateString('en-US', { weekday: 'short' }), count: bookings.filter((item) => dateKey(item.date) === key).length }; });
  }
  const months = period === 'Quarterly' ? Array.from({ length: 3 }, (_, index) => Math.floor(now.getMonth() / 3) * 3 + index)
    : Array.from({ length: 12 }, (_, index) => index);
  return months.map((month) => ({ label: new Date(now.getFullYear(), month, 1).toLocaleDateString('en-US', { month: 'short' }),
    count: bookings.filter((item) => { const key = dateKey(item.date); const date = new Date(`${key}T12:00:00`);
      return key && date.getFullYear() === now.getFullYear() && date.getMonth() === month; }).length }));
}

export default function AdminDashboard({ view = 'dashboard', onNavigate, onLogout }) {
  const [overview, setOverview] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [period, setPeriod] = useState('Weekly');
  const [error, setError] = useState('');
  const refresh = async () => {
    try { const [nextOverview, nextAccounts, nextDoctors] = await Promise.all([api('admin/overview'), api('admin/accounts'), api('admin/doctors')]);
      setOverview(nextOverview); setAccounts(nextAccounts); setDoctors(nextDoctors); setError(''); }
    catch (requestError) { setError(requestError.message || 'Unable to load admin records.'); }
  };
  useEffect(() => { refresh(); const timer = setInterval(refresh, 10000); return () => clearInterval(timer); }, []);
  const bars = useMemo(() => chartData(overview?.bookings || [], period), [overview, period]);
  const max = Math.max(1, ...bars.map((bar) => bar.count));
  const ticks = [max, Math.round(max * .7), Math.round(max * .5), Math.round(max * .25), Math.round(max * .1), 0];
  const pending = accounts.filter((account) => account.status === 'pending');
  const title = view === 'users' ? 'User Management' : view === 'doctors' ? 'Doctor Management' : 'Dashboard';
  return <AdminShell active={view} title={title} subtitle={view === 'dashboard' ? 'A live overview of MedVault activity' :
    view === 'users' ? 'Create, review, and manage staff access' : 'Manage physician profiles and secretary assignments'} onNavigate={onNavigate} onLogout={onLogout}>
    {error && <p className="medsec-error" role="alert">{error}</p>}
    {view === 'users' ? <AdminUserManagement accounts={accounts} onRefresh={refresh} /> :
      view === 'doctors' ? <AdminDoctorManagement doctors={doctors} accounts={accounts} onRefresh={refresh} /> : <>
        <section className="nd-row-top"><div className="kpi-quad-grid admin-kpis">{[
          ['Staff Accounts', overview?.staff ?? '—', 'users', '#00ADEF'],
          ['Doctors', overview?.doctors ?? '—', 'doctors', '#F97316'],
          ['Patients', overview?.patients ?? '—', null, '#C084FC'],
          ['Appointments', overview?.appointments ?? '—', null, '#EF4444'],
        ].map(([label, count, target, color]) => <div className="kpi-card" key={label} role="group" aria-label={label}>
          <div className="kpi-texts"><span className="kpi-heading">{label}</span><strong className="kpi-digit">{count}</strong></div>
          <KpiIcon label={label} color={color} />
          {target && <button type="button" className="admin-card-link" onClick={() => onNavigate(target)}>Manage →</button>}</div>)}</div>
          <div className="nd-chart-card"><div className="chart-card-top-bar"><div className="chart-range-pill" role="tablist" aria-label="Appointment chart period">
            {periods.map((item) => <button key={item} type="button" role="tab" aria-selected={period === item}
              className={`range-tab-btn ${period === item ? 'active' : ''}`} onClick={() => setPeriod(item)}>{item}</button>)}
          </div></div><div className="chart-wrapper-exact"><div className="exact-y-axis">{ticks.map((tick, index) => <span key={index}>{tick}</span>)}</div>
            <div className="exact-chart-canvas"><div className="grid-horizontal-lines">{[100, 70, 50, 25, 10, 0].map((value) => <div key={value} className="h-line" style={{ bottom: `${value}%` }} />)}</div>
              <div className="bars-flex-container">{bars.map((item, index) => <div className="exact-bar-column" key={`${item.label}-${index}`}>
                <div className="bar-vertical-track"><div className="exact-cyan-bar animate-grow-bar" style={{ height: `${Math.max(item.count ? 5 : 0, item.count / max * 100)}%` }}
                  data-tooltip={`${item.count} appointments`} aria-label={`${item.label}: ${item.count} appointments`} /></div><span className="day-x-label">{item.label}</span>
              </div>)}</div></div></div></div>
        </section>
        <section className="nd-row-tables"><div className="nd-table-card admin-table-card"><h2 className="card-table-title">Registration Requests</h2>
          <div className="admin-request-list">{pending.slice(0, 4).map((account) => <div className="admin-table-row" key={account.username}><span><strong>{account.firstName} {account.lastName}</strong><small>@{account.username} · {account.role}</small></span><span className="medsec-badge consultation">Pending</span></div>)}
            {!pending.length && <p className="medsec-muted">No pending registrations.</p>}</div>
          <button type="button" className="admin-card-link" onClick={() => onNavigate('users')}>Review Accounts →</button></div>
          <div className="nd-table-card admin-table-card"><h2 className="card-table-title">Doctors</h2><div className="admin-request-list">{doctors.filter((doctor) => doctor.active).slice(0, 4).map((doctor) => <div className="admin-table-row" key={doctor.id}><span><strong>{doctor.name}</strong><small>{doctor.specialty || 'General Medicine'}</small></span><span className="medsec-badge completed">Active</span></div>)}
            {!doctors.length && <p className="medsec-muted">No doctor profiles yet.</p>}</div><button type="button" className="admin-card-link" onClick={() => onNavigate('doctors')}>Manage Doctors →</button></div>
        </section>
        <section className="nd-row-actions admin-quick-actions" aria-label="Quick shortcuts"><button type="button" className="exact-action-card" onClick={() => onNavigate('users')}>
          <span className="action-label-stack"><span>User</span><span>Management</span></span><span className="plus-symbol purple-plus" aria-hidden="true">→</span></button>
          <button type="button" className="exact-action-card" onClick={() => onNavigate('doctors')}><span className="action-label-stack"><span>Doctor</span><span>Management</span></span><span className="plus-symbol cyan-plus" aria-hidden="true">→</span></button>
        </section>
      </>}
  </AdminShell>;
}
