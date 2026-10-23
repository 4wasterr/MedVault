import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPhone, phoneInput, isPHMobile, contactProblem, normalizeSpecialty, specialtyLabel } from '../../shared/formRules.mjs';
import { dismissSession, endSession, isSessionDismissed, resumeSession } from './sessionState.js';
import { api } from './sharedState.js';
import { fieldProblem } from './formFeedback.js';

test('phone entry and display consistently group Philippine numbers, including legacy records', () => {
  for (const value of ['+639171234567', '09171234567', '9171234567', '+63 917 123 4567']) {
    assert.equal(formatPhone(value), '+63 917 123 4567');
    assert.equal(phoneInput(value), '+63 917 123 4567');
  }
  for (const value of ['', '+', '+6', '+63', '+63 9', '+63 917', '+63 917 1', '+63 917 123 4']) assert.equal(phoneInput(value), value);
  assert.equal(phoneInput('09'), '+63 9');
  assert.equal(isPHMobile('+63 917 123 4567'), true);
  assert.equal(isPHMobile('+639171234567'), true);
  for (const value of ['09171234567', '+63 817 123 4567', '+63 9171234567', '+63 917 123 45678']) assert.equal(isPHMobile(value), false);
  assert.equal(contactProblem({ contact: '+63 917 123 4567', emergencyContact: '+63 918 123 4567', emergencyRelationship: 'Parent' }), null);
});

test('legacy specialty names map to stable values and consistent labels', () => {
  assert.equal(normalizeSpecialty('General Medicine'), 'General Health');
  assert.equal(normalizeSpecialty('Cardiology'), 'Cardiologist');
  assert.equal(specialtyLabel('Cardiologist'), 'Cardiology');
  assert.equal(specialtyLabel('Gastroenterologist'), 'Gastroenterology');
});

test('sign-out prevents stale-cookie session recovery even if the server logout fails', async () => {
  const entries = new Map();
  globalThis.window = { sessionStorage: { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) } };
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = () => { requests++; throw new Error('Offline'); };
  try {
    dismissSession();
    await assert.rejects(endSession(() => api('logout', { method: 'POST' })), /Offline/);
    assert.equal(isSessionDismissed(), true);
    const before = requests;
    for (const path of ['state', 'session', 'changes']) await assert.rejects(api(path), error => error.status === 401);
    assert.equal(requests, before);
    resumeSession();
    assert.equal(isSessionDismissed(), false);
  } finally { resumeSession(); globalThis.fetch = previousFetch; delete globalThis.window; }
});

test('a new login waits for an earlier logout so its session cannot be revoked by that request', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(url);
    return { ok: true, json: async () => url === '/api/csrf' ? { csrfToken: 'test-token' } : { role: 'Receptionist', username: 'alice' } };
  };
  try {
    let completeLogout;
    const pending = endSession(() => new Promise(resolve => { completeLogout = resolve; }));
    const login = api('login', { method: 'POST', body: '{}' });
    await Promise.resolve();
    assert.equal(calls.length, 0);
    completeLogout();
    await pending;
    assert.equal((await login).username, 'alice');
    assert.equal(calls.at(-1), '/api/login');
  } finally { globalThis.fetch = previousFetch; }
});

test('live validation reports required and phone errors as the input changes', () => {
  const field = { disabled: false, readOnly: false, required: true, value: '', dataset: {}, labels: [],
    closest: () => null, getAttribute: key => key === 'aria-label' ? 'Contact number' : null, validity: {},
    pattern: '\\+63(?:9[0-9]{9}| 9[0-9]{2} [0-9]{3} [0-9]{4})', type: 'tel' };
  assert.equal(fieldProblem(field), 'Contact number is required.');
  field.value = '+63 917';
  assert.match(fieldProblem(field), /\+63 XXX XXX XXXX/);
  field.value = '+63 917 123 4567';
  assert.equal(fieldProblem(field), '');
});

test('aborting sign-out during a stalled CSRF request cannot send a late logout after a new login', async () => {
  const { api: isolatedApi } = await import('./sharedState.js?stalled-csrf');
  const previousFetch = globalThis.fetch;
  const calls = [];
  let finishCsrf;
  globalThis.fetch = url => {
    calls.push(url);
    return new Promise(resolve => { finishCsrf = resolve; });
  };
  const controller = new AbortController();
  try {
    const logout = isolatedApi('logout', { method: 'POST', signal: controller.signal });
    controller.abort();
    await assert.rejects(logout, error => error.name === 'AbortError');
    finishCsrf({ ok: true, json: async () => ({ csrfToken: 'late-token' }) });
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(calls, ['/api/csrf']);
  } finally { globalThis.fetch = previousFetch; }
});
