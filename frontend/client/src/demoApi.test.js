import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoApi } from './demoApi.js';
import { createDemoData, demoPassword } from './demoData.js';
import { changesBetween } from './sharedState.js';
import { createServer } from 'vite';

const post = body => ({ method: 'POST', body: JSON.stringify(body) });
const login = (api, username) => api('login', post({ username: `demo.${username}`, password: demoPassword }));

test('demo roles sign in independently and administrative access stays separate', async () => {
  const api = createDemoApi();
  await assert.rejects(api('session'), { status: 401 });
  await assert.rejects(api('login', post({ username: 'demo.admin', password: 'wrong' })), { status: 401 });
  for (const [username, role] of [['receptionist', 'Receptionist'], ['secretary', 'Medical Secretary'], ['admin', 'Super Admin']]) {
    assert.equal((await login(api, username)).role, role);
    assert.equal((await api('session')).username, `demo.${username}`);
    if (username !== 'admin') await assert.rejects(api('admin/accounts'), { status: 403 });
    await api('logout', post({}));
  }
});

test('related edits survive role switching, keep clinical fields, and reset in a new preview', async () => {
  const api = createDemoApi();
  await login(api, 'receptionist');
  const before = await api('state');
  assert.deepEqual(before.patients[0].vitals, {});
  const after = structuredClone(before);
  after.patients[0].address = 'Changed Sample Street';
  after.appointments[0].address = 'Changed Sample Street';
  const saved = await api('changes', post({ changes: changesBetween(before, after) }));
  assert.equal(saved.patients[0].address, 'Changed Sample Street');
  // Responses must not expose references into the demo store.
  saved.patients[0].name = 'Mutated response';
  await api('logout', post({}));
  await login(api, 'secretary');
  const secretary = await api('state');
  assert.equal(secretary.patients[0].address, 'Changed Sample Street');
  assert.equal(secretary.appointments[0].address, 'Changed Sample Street');
  assert.equal(secretary.patients[0].vitals.bp, '120/80');
  assert.notEqual(secretary.patients[0].name, 'Mutated response');
  const fresh = createDemoApi();
  await login(fresh, 'secretary');
  assert.notEqual((await fresh('state')).patients[0].address, 'Changed Sample Street');
});

test('demo registration, approval, and temporary passwords support the staff review flow', async () => {
  const api = createDemoApi();
  await api('register', post({ username: 'sample.staff', password: 'SamplePass123!', role: 'Receptionist', firstName: 'Sample', lastName: 'Staff' }));
  await assert.rejects(api('login', post({ username: 'sample.staff', password: 'SamplePass123!' })), { status: 403 });
  await login(api, 'admin');
  const accounts = await api('admin/accounts');
  assert.ok(accounts.every(account => !('password' in account) && !('confirmPassword' in account)));
  await api('admin/accounts/sample.staff/decision', post({ decision: 'approve' }));
  const { temporaryPassword } = await api('admin/accounts/sample.staff/reset-password', post({}));
  await api('logout', post({}));
  assert.equal((await api('login', post({ username: 'sample.staff', password: temporaryPassword }))).mustChangePassword, true);
  await api('auth/force-change-password', post({ username: 'sample.staff', currentPassword: temporaryPassword, newPassword: 'ChangedPass123!', confirmPassword: 'ChangedPass123!' }));
  assert.equal((await api('session')).username, 'sample.staff');
});

test('doctor management and audit filters work with preview data', async () => {
  const api = createDemoApi();
  await login(api, 'admin');
  const doctor = await api('admin/doctors', post({ name: 'Dr. Sample Cruz', specialty: 'General Health' }));
  const doctors = await api('admin/doctors');
  assert.equal(new Set(doctors.map(item => item.id)).size, doctors.length);
  await api(`admin/doctors/${doctor.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) });
  const logs = await api('admin/audit?collection=doctors&action=update&page=99&pageSize=25');
  assert.equal(logs.total, 1);
  assert.equal(logs.page, 1);
  assert.equal(logs.rows[0].record_id, doctor.id);
  assert.ok(logs.options.users.includes('demo.admin'));
  await assert.rejects(api('unimplemented', post({})), { status: 501 });
});

test('sample appointments follow the Manila date instead of becoming stale', () => {
  const { state } = createDemoData(new Date('2030-01-01T18:00:00Z'));
  assert.equal(state.appointments[0].date, '2030-01-02');
  assert.equal(state.appointments[2].date, '2030-01-01');
});

test('Vite demo mode routes the real UI API helper without any network requests', async () => {
  const server = await createServer({ mode: 'demo', server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'silent' });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('The frontend demo must not call fetch.'); };
  try {
    const { api } = await server.ssrLoadModule('/src/sharedState.js');
    await login(api, 'admin');
    assert.equal((await api('admin/overview')).patients, 3);
    await assert.rejects(api('unsupported'), { status: 501 });
    const { draftKey } = await server.ssrLoadModule('/src/draftStorage.js');
    assert.ok(draftKey('Receptionist:demo.receptionist', 'form').startsWith('medvault:demo:draft:'));
    const { clearDemoDrafts } = await server.ssrLoadModule('/src/demoMode.js');
    const values = new Map([['medvault:demo:draft:v1:sample', 'demo'], ['medvault:draft:v1:real', 'keep'], ['medvault_patients', 'keep']]);
    globalThis.window = { localStorage: { get length() { return values.size; }, key: index => [...values.keys()][index], removeItem: key => values.delete(key) } };
    try {
      clearDemoDrafts();
      assert.deepEqual([...values.keys()], ['medvault:draft:v1:real', 'medvault_patients']);
    } finally { delete globalThis.window; }
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('connected mode continues to use the real API and existing draft namespace', async () => {
  const server = await createServer({ mode: 'development', server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'silent' });
  const previousFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async url => { requested = url; return { ok: true, json: async () => ({ username: 'connected.user' }) }; };
  try {
    const { api } = await server.ssrLoadModule('/src/sharedState.js');
    assert.equal((await api('session')).username, 'connected.user');
    assert.equal(requested, '/api/session');
    const { draftKey } = await server.ssrLoadModule('/src/draftStorage.js');
    assert.ok(draftKey('Receptionist:connected.user', 'form').startsWith('medvault:draft:v1:'));
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});
