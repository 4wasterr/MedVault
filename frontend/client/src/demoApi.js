import { createDemoData, demoPassword } from './demoData.js';
import { applyChanges } from './sharedState.js';

const clone = value => structuredClone(value);
function fail(status, message) { throw Object.assign(new Error(message), { status }); }

// This adapter has no fetch, API client, server imports, or persistent record storage.
export function createDemoApi() {
  let { accounts, state } = createDemoData();
  const passwords = new Map(accounts.map(account => [account.username, demoPassword]));
  let session = null;
  let sequence = 0;
  const audit = [];
  const log = (action, collection, recordId) => audit.push({
    id: ++sequence, occurred_at: new Date().toISOString(), username: session?.username || 'anonymous',
    role: session?.role || 'anonymous', action, collection, record_id: recordId,
    summary: `Demo: ${action} in ${collection}.`, context: 'Browser preview only',
  });
  const visibleState = () => {
    const result = clone(state);
    if (session.role === 'Receptionist') for (const patient of result.patients) {
      Object.assign(patient, { vitals: {}, medical: {}, medicalHistory: {}, consultation: {}, visits: [], recordNotes: [] });
    }
    result.doctors = result.doctors.filter(doctor => doctor.active);
    return result;
  };
  const publicAccount = account => {
    const { password: _password, confirmPassword: _confirmPassword, ...result } = account;
    return clone(result);
  };

  return async (path, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    const [route, query = ''] = path.split('?');
    const body = options.body ? JSON.parse(options.body) : {};
    if (route === 'login' && method === 'POST') {
      const username = String(body.username || '').trim().toLowerCase();
      const account = accounts.find(item => item.username === username);
      if (!account || passwords.get(username) !== body.password) fail(401, 'Incorrect demo username or password. See the demo banner for sample logins.');
      if (account.status !== 'approved') fail(403, 'This demo account has not been approved or is deactivated.');
      if (account.mustChangePassword) return { username, role: account.role, mustChangePassword: true };
      session = { username, role: account.role };
      log('login', 'security', username);
      return clone(session);
    }
    if (route === 'register' && method === 'POST') {
      const username = String(body.username || '').trim().toLowerCase();
      if (accounts.some(account => account.username === username)) fail(409, 'Username is already used in this preview.');
      if (!['Receptionist', 'Medical Secretary'].includes(body.role)) fail(400, 'Choose a staff role.');
      passwords.set(username, body.password);
      accounts.push({ ...publicAccount(body), username, status: 'pending', createdAt: new Date().toISOString() });
      log('registration', 'staff_accounts', username);
      return { message: 'Demo request submitted. Sign in as demo.admin to approve it.' };
    }
    if (route === 'auth/force-change-password' && method === 'POST') {
      const account = accounts.find(item => item.username === body.username);
      if (!account?.mustChangePassword || passwords.get(body.username) !== body.currentPassword) fail(401, 'Invalid temporary demo password.');
      if (!body.newPassword || body.newPassword !== body.confirmPassword) fail(400, 'Passwords must match.');
      passwords.set(account.username, body.newPassword);
      account.mustChangePassword = false;
      session = { username: account.username, role: account.role };
      log('password-reset', 'security', account.username);
      return clone(session);
    }
    if (!session) fail(401, 'Sign in to the frontend demo.');
    if (route === 'session' && method === 'GET') return clone(session);
    if (route === 'logout' && method === 'POST') {
      log('logout', 'security', session.username);
      session = null;
      return { ok: true };
    }
    if (route === 'state' && method === 'GET') return visibleState();
    if (route === 'activity' && method === 'POST') {
      log('view', body.collection, body.recordId);
      return { ok: true };
    }
    if (route === 'changes' && method === 'POST') {
      if (!['Receptionist', 'Medical Secretary'].includes(session.role)) fail(403, 'Use a staff demo account to edit these records.');
      if (!Array.isArray(body.changes) || body.changes.some(change => !['patients', 'appointments', 'schedules'].includes(change.collection))) fail(400, 'Invalid demo changes.');
      const changes = body.changes.map(change => {
        const previous = state.patients.find(patient => patient.id === change.id);
        if (session.role === 'Receptionist' && change.collection === 'patients' && change.after && previous) {
          const after = { ...change.after };
          for (const key of ['vitals', 'medical', 'medicalHistory', 'consultation', 'visits', 'recordNotes']) after[key] = previous[key];
          return { ...change, after };
        }
        return change;
      });
      state = applyChanges(state, clone(changes));
      for (const change of changes) log(change.after === null ? 'delete' : change.before ? 'update' : 'create', change.collection, change.id);
      return visibleState();
    }
    if (route.startsWith('admin/')) {
      if (session.role !== 'Super Admin') fail(403, 'Sign in as demo.admin to preview administration.');
      if (route === 'admin/overview' && method === 'GET') return {
        staff: accounts.filter(account => account.status === 'approved' && account.role !== 'Super Admin').length,
        pending: accounts.filter(account => account.status === 'pending').length,
        doctors: state.doctors.filter(doctor => doctor.active).length, patients: state.patients.length,
        appointments: state.appointments.filter(item => !['Open', 'Cancelled'].includes(item.status)).length,
        bookings: state.appointments.map(({ date, status }) => ({ date, status })),
      };
      if (route === 'admin/accounts' && method === 'GET') return accounts.map(publicAccount);
      if (route === 'admin/accounts' && method === 'POST') {
        if (accounts.some(account => account.username === body.username)) fail(409, 'Username is already used in this preview.');
        accounts.push({ ...publicAccount(body), createdAt: new Date().toISOString() });
        passwords.set(body.username, body.password);
        log('create', 'staff_accounts', body.username);
        return publicAccount(accounts.at(-1));
      }
      const accountMatch = /^admin\/accounts\/([^/]+)(?:\/(decision|reset-password))?$/.exec(route);
      if (accountMatch) {
        const username = decodeURIComponent(accountMatch[1]);
        const account = accounts.find(item => item.username === username);
        if (!account) fail(404, 'Demo account not found.');
        if (accountMatch[2] === 'decision' && method === 'POST') {
          account.status = body.decision === 'approve' ? 'approved' : 'rejected';
          log(body.decision === 'approve' ? 'approve' : 'reject', 'staff_accounts', username);
          return publicAccount(account);
        }
        if (accountMatch[2] === 'reset-password' && method === 'POST') {
          const temporaryPassword = 'DemoReset123!';
          passwords.set(username, temporaryPassword);
          account.mustChangePassword = true;
          log('password-reset', 'staff_accounts', username);
          return { temporaryPassword };
        }
        if (!accountMatch[2] && method === 'PATCH') {
          const nextUsername = body.username || username;
          if (nextUsername !== username && accounts.some(item => item.username === nextUsername)) fail(409, 'Username is already used in this preview.');
          if (username === session.username && (nextUsername !== username || body.status === 'deactivated' || (body.role && body.role !== 'Super Admin'))) fail(409, 'Keep the current demo administrator active.');
          const password = body.password || passwords.get(username);
          passwords.delete(username);
          passwords.set(nextUsername, password);
          Object.assign(account, publicAccount(body));
          for (const doctor of state.doctors) if (doctor.secretaryUsername === username) doctor.secretaryUsername = nextUsername;
          log('update', 'staff_accounts', nextUsername);
          return publicAccount(account);
        }
      }
      if (route === 'admin/doctors' && method === 'GET') return clone(state.doctors);
      if (route === 'admin/doctors' && method === 'POST') {
        const doctor = { ...body, id: `DEMO-DOC-NEW-${++sequence}`, active: body.active !== false };
        state.doctors.push(doctor);
        log('create', 'doctors', doctor.id);
        return clone(doctor);
      }
      const doctorMatch = /^admin\/doctors\/([^/]+)$/.exec(route);
      if (doctorMatch && method === 'PATCH') {
        const doctor = state.doctors.find(item => item.id === decodeURIComponent(doctorMatch[1]));
        if (!doctor) fail(404, 'Demo doctor not found.');
        const oldName = doctor.name;
        Object.assign(doctor, body);
        if (doctor.name !== oldName) {
          for (const item of state.appointments) if (item.doctor === oldName) item.doctor = doctor.name;
          for (const patient of state.patients) for (const item of patient.appointments || []) if (item.doctor === oldName) item.doctor = doctor.name;
          state.schedules = Object.fromEntries(Object.entries(state.schedules).map(([key, schedule]) => schedule.doctor === oldName
            ? [`${doctor.name}|${schedule.date}`, { ...schedule, doctor: doctor.name }] : [key, schedule]));
        }
        log('update', 'doctors', doctor.id);
        return clone(doctor);
      }
      if (route === 'admin/audit' && method === 'GET') {
        const params = new URLSearchParams(query);
        const search = (params.get('search') || '').toLowerCase();
        const filtered = audit.filter(row => ['username', 'role', 'collection', 'action'].every(field => !params.get(field) || row[field] === params.get(field)) &&
          (!search || [row.username, row.role, row.collection, row.action, row.record_id].join(' ').toLowerCase().includes(search)) &&
          (!params.get('from') || row.occurred_at >= params.get('from')) && (!params.get('to') || row.occurred_at < params.get('to')));
        const sort = ['occurred_at', 'username', 'role', 'collection', 'action'].includes(params.get('sort')) ? params.get('sort') : 'occurred_at';
        const direction = params.get('order') === 'asc' ? 1 : -1;
        filtered.sort((a, b) => (String(a[sort]).localeCompare(String(b[sort])) || a.id - b.id) * direction);
        const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize')) || 25));
        const page = Math.min(Math.max(1, Number(params.get('page')) || 1), Math.max(1, Math.ceil(filtered.length / pageSize)));
        const options = Object.fromEntries([['users', 'username'], ['roles', 'role'], ['collections', 'collection'], ['actions', 'action']]
          .map(([key, field]) => [key, [...new Set(audit.map(row => row[field]))].sort()]));
        return clone({ rows: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize, options });
      }
    }
    fail(501, 'This action is unavailable in the frontend demo. Use npm run dev:full with PostgreSQL for the full system.');
  };
}

export const demoApi = createDemoApi();
