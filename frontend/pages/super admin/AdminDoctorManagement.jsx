import React, { useMemo, useState } from 'react';
import { api } from '../../client/src/sharedState';
import './AdminDoctorManagement.css';

const blank = { name: '', specialty: '', phone: '', email: '', secretaryUsername: '', active: true };

export default function AdminDoctorManagement({ doctors, accounts, onRefresh }) {
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const secretaries = accounts.filter((account) => account.role === 'Medical Secretary' && account.status === 'approved');
  const secretaryLabel = (username) => {
    if (!username) return 'Unassigned';
    const account = secretaries.find((item) => item.username === username);
    return account ? `${account.firstName} ${account.lastName} (@${username})` : `@${username}`;
  };
  const visible = useMemo(() => doctors.filter((doctor) =>
    `${doctor.name} ${doctor.specialty} ${doctor.secretaryUsername}`.toLowerCase().includes(search.toLowerCase())), [doctors, search]);
  const startCreate = () => { setEditing(''); setForm(blank); setError(''); setOpen(true); };
  const startEdit = (doctor) => { setEditing(doctor.id); setForm({ ...doctor }); setError(''); setOpen(true); };
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { await api(editing ? `admin/doctors/${encodeURIComponent(editing)}` : 'admin/doctors', {
      method: editing ? 'PATCH' : 'POST', body: JSON.stringify(form),
    }); await onRefresh(); setMessage(editing ? 'Doctor profile updated.' : 'Doctor profile created.'); setOpen(false); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  const toggle = async (doctor) => {
    setBusy(true); setError(''); setMessage('');
    try { await api(`admin/doctors/${encodeURIComponent(doctor.id)}`, { method: 'PATCH', body: JSON.stringify({ active: !doctor.active }) });
      await onRefresh(); setMessage(doctor.active ? 'Doctor profile deactivated.' : 'Doctor profile activated.'); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  return <section className="medsec-panel"><div className="medsec-panel-heading"><div><h2>Doctor Profiles</h2><p className="medsec-muted">These physicians appear in staff bookings and schedules.</p></div>
    <button type="button" className="medsec-btn" onClick={startCreate}>+ Add Doctor</button></div>
    <div className="admin-toolbar"><label className="medsec-field"><span>Search doctors</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, specialty, or secretary" /></label></div>
    {error && <p className="medsec-error" role="alert">{error}</p>}{message && <p className="medsec-notice" role="status">{message}</p>}
    <div className="admin-request-list">{visible.map((doctor) => <div className="admin-record" key={doctor.id}><div><strong>{doctor.name}</strong><small>{doctor.specialty || 'Specialty not set'} · {doctor.email || 'No email'}</small>
      <small>Medical Secretary: {secretaryLabel(doctor.secretaryUsername)}</small></div>
      <div className="admin-record-actions"><span className={`medsec-badge ${doctor.active ? 'completed' : 'blocked'}`}>{doctor.active ? 'Active' : 'Inactive'}</span><button type="button" className="medsec-btn secondary" onClick={() => startEdit(doctor)}>Edit</button>
        <button type="button" className={`medsec-btn ${doctor.active ? 'danger' : 'secondary'}`} disabled={busy} onClick={() => toggle(doctor)}>{doctor.active ? 'Deactivate' : 'Activate'}</button></div></div>)}
      {!visible.length && <p className="medsec-muted">No doctor profiles found.</p>}</div>
    {open && <div className="medsec-modal-backdrop" role="presentation" onClick={() => setOpen(false)}><div className="medsec-modal admin-form-modal" role="dialog" aria-modal="true" aria-labelledby="admin-doctor-title" onClick={(event) => event.stopPropagation()}>
      <h2 id="admin-doctor-title">{editing ? 'Edit Doctor Profile' : 'Add Doctor'}</h2><p>Changing a doctor's name updates linked appointments, patient visits, and schedules.</p>
      <form onSubmit={save}><div className="medsec-form-grid">
        <label className="medsec-field"><span>Doctor Name *</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Dr. Maria Santos" /></label>
        <label className="medsec-field"><span>Specialty</span><input value={form.specialty} onChange={(event) => setForm({ ...form, specialty: event.target.value })} /></label>
        <label className="medsec-field"><span>Phone</span><input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <label className="medsec-field"><span>Email</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label className="medsec-field wide"><span>Assigned Medical Secretary</span><select value={form.secretaryUsername} onChange={(event) => setForm({ ...form, secretaryUsername: event.target.value })}><option value="">Unassigned</option>
          {secretaries.map((item) => <option key={item.username} value={item.username}>{item.firstName} {item.lastName} (@{item.username})</option>)}</select></label>
      </div>{error && <p className="medsec-error" role="alert">{error}</p>}<div className="medsec-actions"><button type="button" className="medsec-btn secondary" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="medsec-btn" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save Changes' : 'Add Doctor'}</button></div></form>
    </div></div>}
  </section>;
}
