import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../client/src/sharedState';
import './AdminAuditLogs.css';

const labels = { patients: 'Patient Records', appointments: 'Appointments', schedules: 'Doctor Schedules', staff_accounts: 'Staff Accounts',
  doctors: 'Doctors', visit_records: 'Visit History', security: 'Sign-in & Security', modules: 'Module Navigation', all: 'Shared Records',
  dashboard: 'Dashboard', users: 'User Management', audit: 'Audit Logs' };
const actionLabels = { login: 'Signed In', logout: 'Signed Out', 'login-failed': 'Failed Sign-in', 'login-denied': 'Sign-in Denied',
  'login-blocked': 'Sign-in Blocked', 'account-locked': 'Account Locked', 'session-expired': 'Session Expired', registration: 'Registration',
  'password-reset': 'Password Reset', 'access-denied': 'Access Denied', 'change-rejected': 'Change Rejected',
  create: 'Created', update: 'Updated', delete: 'Deleted', view: 'Viewed', approve: 'Approved', reject: 'Declined',
  'doctor-rename': 'Doctor Renamed', import: 'Imported', 'import-create': 'Import Created', 'import-update': 'Import Updated', 'import-delete': 'Import Deleted' };
const blank = { search: '', username: '', role: '', collection: '', action: '', from: '', to: '' };
const columns = [['occurred_at', 'Date & Time'], ['username', 'User'], ['role', 'Role'], ['collection', 'Module'], ['action', 'Action']];
const pageSize = 25;
const formatTime = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const formatLabel = value => labels[value] || value;
const tone = action => /failed|denied|blocked|locked|rejected|delete|reject/.test(action) ? 'blocked' : /create|approve|login$/.test(action) ? 'completed' : '';

export default function AdminAuditLogs() {
  const [filters, setFilters] = useState(blank);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ column: 'occurred_at', order: 'desc' });
  const [result, setResult] = useState(null);
  const [options, setOptions] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [selected, setSelected] = useState(null);
  const detailsRef = useRef(null);
  const returnFocus = useRef(null);
  const { username, role, collection, action, from, to } = filters;

  useEffect(() => { const timer = setTimeout(() => { setSearch(filters.search); setPage(1); }, 300); return () => clearTimeout(timer); }, [filters.search]);
  useEffect(() => {
    if (!selected) return undefined;
    detailsRef.current?.focus();
    const close = event => { if (event.key === 'Escape') { setSelected(null); returnFocus.current?.focus(); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selected]);
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: sort.column, order: sort.order });
    for (const [key, value] of [['username', username], ['role', role], ['collection', collection], ['action', action]]) if (value) query.set(key, value);
    if (search.trim()) query.set('search', search.trim());
    const dateBound = (value, nextDay = false) => {
      const date = new Date(`${value}T00:00:00`);
      if (nextDay) date.setDate(date.getDate() + 1);
      return date.toISOString();
    };
    if (from) query.set('from', dateBound(from));
    if (to) query.set('to', dateBound(to, true));
    let inFlight = false;
    const load = async (background = false) => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await api(`admin/audit?${query}`, { signal: controller.signal, headers: background ? { 'X-MedVault-Background': '1' } : {} });
        if (!alive) return;
        setResult(next); setOptions(next.options); setUpdatedAt(new Date()); setError(''); setLoading(false);
        if (next.page !== page) setPage(next.page);
      } catch (requestError) {
        if (!alive || requestError.name === 'AbortError') return;
        setError(requestError.message || 'Unable to load audit logs.'); setLoading(false);
      } finally { inFlight = false; }
    };
    queueMicrotask(() => { if (alive) { setLoading(true); setError(''); setResult(null); void load(); } });
    const timer = setInterval(() => void load(true), 10000);
    return () => { alive = false; controller.abort(); clearInterval(timer); };
  }, [page, sort, search, username, role, collection, action, from, to, refreshKey]);

  const changeFilter = (key, value) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); };
  const sortBy = column => { setSort(current => ({ column, order: current.column === column && current.order === 'asc' ? 'desc' : 'asc' })); setPage(1); };
  const reset = () => { setFilters(blank); setSearch(''); setPage(1); };
  const select = (row, button) => { returnFocus.current = button; setSelected(row); };
  const closeDetails = () => { setSelected(null); returnFocus.current?.focus(); };
  const pages = Math.max(1, Math.ceil((result?.total || 0) / pageSize));

  return <section className="medsec-panel audit-panel" aria-label="All user audit logs">
    <div className="medsec-panel-heading"><div><h2>User Activity <span className="medsec-badge">{result?.total ?? '...'}</span></h2>
      <p className="medsec-muted">Activity from all staff and administrators. Each entry identifies the user, time, and action.</p></div>
      <button type="button" className="medsec-btn secondary" disabled={loading} onClick={() => setRefreshKey(value => value + 1)}>Refresh Logs</button>
    </div>
    <div className="audit-filters">
      <label className="medsec-field audit-search"><span>Search logs</span><input type="search" value={filters.search} placeholder="Username, role, action, module, or record ID" onChange={event => changeFilter('search', event.target.value)} /></label>
      {[['username', 'User', 'users'], ['role', 'Role', 'roles'], ['collection', 'Module', 'collections'], ['action', 'Action', 'actions']].map(([key, label, values]) =>
        <label className="medsec-field" key={key}><span>{label}</span><select value={filters[key]} onChange={event => changeFilter(key, event.target.value)}>
          <option value="">All {label === 'User' ? 'Users' : label === 'Role' ? 'Roles' : label === 'Module' ? 'Modules' : 'Actions'}</option>
          {[...new Set([...(options[values] || []), ...(filters[key] ? [filters[key]] : [])])].map(value => <option key={value} value={value}>{key === 'action' ? actionLabels[value] || value : formatLabel(value)}</option>)}
        </select></label>)}
      <label className="medsec-field"><span>From date</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={event => changeFilter('from', event.target.value)} /></label>
      <label className="medsec-field"><span>To date</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={event => changeFilter('to', event.target.value)} /></label>
      <button type="button" className="medsec-btn secondary" onClick={reset}>Clear Filters</button>
    </div>
    <div className="audit-grid-meta"><span>Read-only history</span><span>{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()} · Refreshes every 10 seconds` : 'Loading activity...'}</span></div>
    {error && <p className="medsec-error" role="alert">{error} <button type="button" className="admin-card-link" onClick={() => setRefreshKey(value => value + 1)}>Retry</button></p>}
    <div className="audit-table-scroll" tabIndex={0} aria-label="Scrollable activity table" aria-busy={loading}>
      <table className="audit-table"><caption className="audit-sr-only">Audit entries for all MedVault users. Select a column heading to sort.</caption>
        <thead><tr>{columns.map(([column, label]) => <th key={column} scope="col" aria-sort={sort.column === column ? sort.order === 'asc' ? 'ascending' : 'descending' : 'none'}>
          <button type="button" onClick={() => sortBy(column)}>{label} <span aria-hidden="true">{sort.column === column ? sort.order === 'asc' ? '↑' : '↓' : '↕'}</span></button></th>)}<th scope="col">Record / Page</th><th scope="col">Details</th></tr></thead>
        <tbody>{result?.rows.map(row => <tr key={row.id} className={selected?.id === row.id ? 'selected' : ''}>
          <td><time dateTime={row.occurred_at}>{formatTime(row.occurred_at)}</time><small>#{row.id}</small></td>
          <td><strong>{row.username}</strong></td><td>{row.role === 'anonymous' ? 'Not signed in' : row.role}</td><td>{formatLabel(row.collection)}</td>
          <td><span className={`medsec-badge ${tone(row.action)}`}>{actionLabels[row.action] || row.action}</span></td>
          <td className="audit-record-id">{row.collection === 'modules' ? formatLabel(row.record_id) : row.record_id}</td>
          <td><button type="button" className="audit-details-button" aria-label={`View details for audit entry ${row.id}`} onClick={event => select(row, event.currentTarget)}>View Details</button></td>
        </tr>)}{!result?.rows.length && <tr><td colSpan={7} className="audit-empty">{loading ? 'Loading audit logs...' : error ? 'Audit logs could not be loaded.' : 'No activity matches these filters.'}</td></tr>}</tbody>
      </table>
    </div>
    <div className="audit-pagination"><span role="status">{result?.total ? `${(result.page - 1) * pageSize + 1}–${Math.min(result.page * pageSize, result.total)} of ${result.total} entries` : '0 entries'}</span>
      <div className="audit-page-controls"><button type="button" className="medsec-btn secondary" disabled={loading || !result || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button>
        <span>Page {result?.page || page} of {pages}</span><button type="button" className="medsec-btn secondary" disabled={loading || !result || page >= pages} onClick={() => setPage(value => value + 1)}>Next</button></div>
    </div>
    {selected && <section className="audit-detail-panel" ref={detailsRef} tabIndex={-1} aria-label={`Audit entry ${selected.id} details`}>
      <div className="medsec-panel-heading"><div><h2>Entry #{selected.id}</h2><p className="medsec-muted">{selected.summary}</p></div><button type="button" className="medsec-btn secondary" onClick={closeDetails}>Close Details</button></div>
      <dl className="audit-detail-grid">{[['User', selected.username], ['Role', selected.role === 'anonymous' ? 'Not signed in' : selected.role], ['Date & Time', formatTime(selected.occurred_at)],
        ['Module', formatLabel(selected.collection)], ['Action', actionLabels[selected.action] || selected.action], ['Record / Page', selected.collection === 'modules' ? formatLabel(selected.record_id) : selected.record_id]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="medsec-muted">This log identifies the action and affected record. Medical details and passwords stay private.</p>
      {selected.context && <p className="medsec-muted">Request: {selected.context}</p>}
    </section>}
  </section>;
}
