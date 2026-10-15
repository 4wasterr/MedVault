import React, { useMemo, useState } from 'react';
import { api } from '../../client/src/sharedState';
import AdminDataGrid from './AdminDataGrid';
import { validateStaffForm } from '../medical secretary/medsecData';
import './AdminUserManagement.css';

const blank = { username: '', password: '', firstName: '', middleName: '', lastName: '', address: '', phone: '', email: '', role: 'Receptionist', status: 'approved' };
const filters = ['all', 'pending', 'approved', 'deactivated', 'rejected'];
const fullName = account => [account.firstName, account.middleName, account.lastName].filter(Boolean).join(' ') || account.username;

export default function AdminUserManagement({ accounts, onRefresh }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const visible = useMemo(() => accounts.filter((item) => (filter === 'all' || item.status === filter) &&
    `${item.username} ${fullName(item)} ${item.email} ${item.phone} ${item.address} ${item.role}`.toLowerCase().includes(search.trim().toLowerCase())), [accounts, filter, search]);
  const startCreate = () => { setForm(blank); setEditing(''); setOpen(true); setError(''); };
  const startEdit = (account) => { setForm({ ...account, password: '' }); setEditing(account.username); setOpen(true); setError(''); };
  const run = async (operation, success) => {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); await onRefresh(); setMessage(success); return true; }
    catch (requestError) { setError(requestError.message); return false; }
    finally { setBusy(false); }
  };
  const save = async (event) => {
    event.preventDefault();
        const problem = validateStaffForm(form, { editing: !!editing });
    if (problem) { setError(problem); return; }
    const valid = await run(() => api(editing ? `admin/accounts/${encodeURIComponent(editing)}` : 'admin/accounts', {
      method: editing ? 'PATCH' : 'POST', body: JSON.stringify(form),
    }), editing ? 'Account updated.' : 'Staff account created.');
    if (valid) { setOpen(false); setEditing(''); setForm(blank); }
  };
  const review = (account, decision) => run(() => api(`admin/accounts/${encodeURIComponent(account.username)}/decision`, {
    method: 'POST', body: JSON.stringify({ decision }),
  }), decision === 'approve' ? 'Account approved.' : 'Request declined.');
  const toggle = (account) => run(() => api(`admin/accounts/${encodeURIComponent(account.username)}`, {
    method: 'PATCH', body: JSON.stringify({ status: account.status === 'deactivated' ? 'approved' : 'deactivated' }),
  }), account.status === 'deactivated' ? 'Account reactivated.' : 'Account deactivated.');

  const columns = [
    { key: 'name', label: 'Staff Name', value: fullName, className: 'admin-grid-name', render: account => <><strong>{fullName(account)}</strong>{account.system && <small>System account</small>}</> },
    { key: 'username', label: 'Username', value: account => account.username, render: account => <>@{account.username}</> },
    { key: 'role', label: 'Role', value: account => account.role },
    { key: 'contact', label: 'Contact Details', value: account => account.email, className: 'admin-grid-contact', render: account => <>
      <span>{account.email || 'No email'}</span>{account.phone && <small>{account.phone}</small>}{account.address && <small>{account.address}</small>}
    </> },
    { key: 'status', label: 'Status', value: account => account.status, className: 'admin-grid-status', render: account => <span className={`medsec-badge admin-status ${account.status === 'approved' ? 'completed' : account.status === 'pending' ? 'consultation' : 'blocked'}`}>{account.status}</span> },
    { key: 'actions', label: 'Actions', className: 'admin-grid-actions', render: account => <div className="admin-record-actions">
      {account.system ? <span className="medsec-muted">Managed by system</span> : <>
        {account.status === 'pending' && <><button type="button" className="medsec-btn" disabled={busy} aria-label={`Approve ${account.username}`} onClick={() => review(account, 'approve')}>Approve</button><button type="button" className="medsec-btn danger" disabled={busy} aria-label={`Decline ${account.username}`} onClick={() => review(account, 'reject')}>Decline</button></>}
        {account.status === 'rejected' && <button type="button" className="medsec-btn secondary" disabled={busy} aria-label={`Approve ${account.username}`} onClick={() => review(account, 'approve')}>Approve</button>}
        {['approved', 'deactivated'].includes(account.status) && <><button type="button" className="medsec-btn secondary" disabled={busy} aria-label={`Edit ${account.username}`} onClick={() => startEdit(account)}>Edit</button><button type="button" className={`medsec-btn ${account.status === 'approved' ? 'danger' : 'secondary'}`} disabled={busy} aria-label={`${account.status === 'approved' ? 'Deactivate' : 'Reactivate'} ${account.username}`} onClick={() => toggle(account)}>{account.status === 'approved' ? 'Deactivate' : 'Reactivate'}</button></>}
      </>}
    </div> },
  ];

  return <section className="medsec-panel admin-management-panel"><div className="medsec-panel-heading"><div><h2>Staff Accounts</h2><p className="medsec-muted">Review signups and manage staff access across the shared system.</p></div>
    <button type="button" className="medsec-btn" onClick={startCreate}>+ Create Account</button></div>
    <div className="admin-toolbar"><label className="medsec-field"><span>Search staff</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, username, email, or role" /></label>
      <div className="medsec-tabs admin-filter-tabs" role="group" aria-label="Account status">{filters.map((item) => <button key={item} type="button" aria-pressed={filter === item} className={`medsec-tab ${filter === item ? 'active' : ''}`} onClick={() => setFilter(item)}>{item[0].toUpperCase() + item.slice(1)}{item === 'pending' ? ` (${accounts.filter((account) => account.status === 'pending').length})` : ''}</button>)}</div></div>
    {error && <p className="medsec-error" role="alert">{error}</p>}{message && <p className="medsec-notice" role="status">{message}</p>}
    <AdminDataGrid rows={visible} columns={columns} rowKey={account => account.username} label="Staff accounts" itemLabel="accounts" resetKey={`${filter}|${search}`}
      emptyMessage={accounts.length ? 'No accounts match your search and status filter.' : 'No staff accounts yet. Create an account to get started.'} />
    {open && <div className="medsec-modal-backdrop" role="presentation" onClick={() => setOpen(false)}><div className="medsec-modal admin-form-modal" role="dialog" aria-modal="true" aria-labelledby="admin-account-title" onClick={(event) => event.stopPropagation()}>
      <h2 id="admin-account-title">{editing ? 'Edit Staff Account' : 'Create Staff Account'}</h2><p>Staff can sign in after an admin creates or approves their account.</p>
      <form onSubmit={save}><div className="medsec-form-grid">
        <label className="medsec-field"><span>Username *</span><input required minLength="3" maxLength="32" value={form.username} disabled={!!editing} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
        <label className="medsec-field"><span>{editing ? 'New Password (optional)' : 'Password *'}</span><input type="password" required={!editing} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
        <label className="medsec-field"><span>First Name *</span><input required value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></label>
        <label className="medsec-field"><span>Middle Name</span><input value={form.middleName} onChange={(event) => setForm({ ...form, middleName: event.target.value })} /></label>
        <label className="medsec-field"><span>Last Name *</span><input required value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></label>
        <label className="medsec-field"><span>Role *</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option>Receptionist</option><option>Medical Secretary</option><option>Super Admin</option></select></label>
        <label className="medsec-field"><span>Phone *</span><input type="tel" required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <label className="medsec-field"><span>Email *</span><input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label className="medsec-field wide"><span>Address *</span><input required value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
      </div>{error && <p className="medsec-error" role="alert">{error}</p>}<div className="medsec-actions"><button type="button" className="medsec-btn secondary" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="medsec-btn" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save Changes' : 'Create Account'}</button></div></form>
    </div></div>}
  </section>;
}
