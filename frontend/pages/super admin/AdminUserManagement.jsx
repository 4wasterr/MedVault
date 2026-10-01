import React, { useMemo, useState } from 'react';
import { api } from '../../client/src/sharedState';
import './AdminUserManagement.css';

const blank = { username: '', password: '', firstName: '', middleName: '', lastName: '', address: '', phone: '', email: '', role: 'Receptionist', status: 'approved' };
const filters = ['all', 'pending', 'approved', 'deactivated', 'rejected'];

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
    `${item.username} ${item.firstName} ${item.lastName} ${item.email} ${item.role}`.toLowerCase().includes(search.toLowerCase())), [accounts, filter, search]);
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

  return <section className="medsec-panel"><div className="medsec-panel-heading"><div><h2>Staff Accounts</h2><p className="medsec-muted">Review signups and manage staff access across the shared system.</p></div>
    <button type="button" className="medsec-btn" onClick={startCreate}>+ Create Account</button></div>
    <div className="admin-toolbar"><label className="medsec-field"><span>Search staff</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, username, email, or role" /></label>
      <div className="medsec-tabs admin-filter-tabs" role="group" aria-label="Account status">{filters.map((item) => <button key={item} type="button" className={`medsec-tab ${filter === item ? 'active' : ''}`} onClick={() => setFilter(item)}>{item[0].toUpperCase() + item.slice(1)}{item === 'pending' ? ` (${accounts.filter((account) => account.status === 'pending').length})` : ''}</button>)}</div></div>
    {error && <p className="medsec-error" role="alert">{error}</p>}{message && <p className="medsec-notice" role="status">{message}</p>}
    <div className="admin-request-list">{visible.map((account) => <div className="admin-record" key={account.username}>
      <div><strong>{[account.firstName, account.middleName, account.lastName].filter(Boolean).join(' ')}</strong><small>@{account.username} · {account.role}{account.email ? ` · ${account.email}` : ''}</small>{(account.phone || account.address) && <small>{[account.phone, account.address].filter(Boolean).join(' · ')}</small>}</div>
      <div className="admin-record-actions"><span className={`medsec-badge admin-status ${account.status === 'approved' ? 'completed' : account.status === 'pending' ? 'consultation' : 'blocked'}`}>{account.status}</span>
        {account.system && <span className="medsec-badge">System account</span>}
        {account.status === 'pending' && <><button type="button" className="medsec-btn" disabled={busy} onClick={() => review(account, 'approve')}>Approve</button><button type="button" className="medsec-btn danger" disabled={busy} onClick={() => review(account, 'reject')}>Decline</button></>}
        {account.status === 'rejected' && <button type="button" className="medsec-btn secondary" disabled={busy} onClick={() => review(account, 'approve')}>Approve</button>}
        {!account.system && ['approved', 'deactivated'].includes(account.status) && <><button type="button" className="medsec-btn secondary" onClick={() => startEdit(account)}>Edit</button><button type="button" className={`medsec-btn ${account.status === 'approved' ? 'danger' : 'secondary'}`} disabled={busy} onClick={() => toggle(account)}>{account.status === 'approved' ? 'Deactivate' : 'Reactivate'}</button></>}
      </div></div>)}{!visible.length && <p className="medsec-muted">No matching accounts found.</p>}</div>
    {open && <div className="medsec-modal-backdrop" role="presentation" onClick={() => setOpen(false)}><div className="medsec-modal admin-form-modal" role="dialog" aria-modal="true" aria-labelledby="admin-account-title" onClick={(event) => event.stopPropagation()}>
      <h2 id="admin-account-title">{editing ? 'Edit Staff Account' : 'Create Staff Account'}</h2><p>Staff can sign in after an admin creates or approves their account.</p>
      <form onSubmit={save}><div className="medsec-form-grid">
        <label className="medsec-field"><span>Username *</span><input required minLength="3" maxLength="32" value={form.username} disabled={!!editing} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
        <label className="medsec-field"><span>{editing ? 'New Password (optional)' : 'Password *'}</span><input type="password" required={!editing} minLength="8" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
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
