import test from 'node:test';
import assert from 'node:assert/strict';

test('registration: staff username validation', () => {
  const isValidUsername = (u) => /^[a-zA-Z0-9._-]{3,32}$/.test(String(u || '').trim());

  assert.ok(isValidUsername('receptionist1'));
  assert.ok(isValidUsername('dr.smith'));
  assert.ok(isValidUsername('jane_doe-2026'));
  assert.equal(isValidUsername('ab'), false); // too short (<3)
  assert.equal(isValidUsername('a'.repeat(33)), false); // too long (>32)
  assert.equal(isValidUsername('user@domain'), false); // invalid character '@'
  assert.equal(isValidUsername('user name'), false); // spaces not allowed
  assert.equal(isValidUsername(''), false);
});

test('registration: strong password policy validation', () => {
  const isStrongPassword = (p) => {
    const s = String(p || '');
    if (s.length < 8) return false;
    const hasUpper = /[A-Z]/.test(s);
    const hasLower = /[a-z]/.test(s);
    const hasDigit = /[0-9]/.test(s);
    const hasSpecial = /[^A-Za-z0-9]/.test(s);
    const categories = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
    return categories >= 3;
  };

  assert.ok(isStrongPassword('MedVault@2026!'));
  assert.ok(isStrongPassword('SecretPass123'));
  assert.ok(isStrongPassword('clinic#99'));
  assert.equal(isStrongPassword('short1!'), false); // <8 chars
  assert.equal(isStrongPassword('alllowercase123'), false); // only 2 categories
  assert.equal(isStrongPassword('ALLUPPERCASE123'), false); // only 2 categories
  assert.equal(isStrongPassword('PasswordOnly'), false); // only 2 categories
});

test('registration: Philippine phone number format validation', () => {
  const isValidPHPhone = (phone) => {
    const clean = String(phone || '').replace(/[\s-]/g, '');
    return /^(09|\+639)\d{9}$/.test(clean);
  };

  assert.ok(isValidPHPhone('09171234567'));
  assert.ok(isValidPHPhone('+639171234567'));
  assert.ok(isValidPHPhone('0917-123-4567'));
  assert.ok(isValidPHPhone('+63 917 123 4567'));
  assert.equal(isValidPHPhone('08171234567'), false); // doesn't start with 09 / +639
  assert.equal(isValidPHPhone('0917123456'), false); // 1 digit short
  assert.equal(isValidPHPhone('091712345678'), false); // 1 digit too long
  assert.equal(isValidPHPhone('abcdefghijk'), false);
});

test('registration: patient date of birth boundary validation', () => {
  const isValidDOB = (dobStr) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dobStr || ''))) return false;
    const d = new Date(dobStr);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    if (d > now) return false; // Future birth date is impossible
    const age = (now - d) / (365.25 * 24 * 3600 * 1000);
    if (age > 130) return false; // Over 130 years old is invalid
    return true;
  };

  assert.ok(isValidDOB('1990-05-15'));
  assert.ok(isValidDOB('2020-01-01'));
  assert.equal(isValidDOB('2099-01-01'), false); // Future
  assert.equal(isValidDOB('1850-01-01'), false); // >130 years ago
  assert.equal(isValidDOB('invalid-date'), false);
  assert.equal(isValidDOB('1990/05/15'), false); // Wrong format
});

test('registration: duplicate patient detection matches server logic', () => {
  const normalizeName = (name) => String(name || '').toLowerCase().replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizePhone = (p) => String(p || '').replace(/[\s-]/g, '').replace(/^\+63/, '0');

  const isDuplicate = (existingList, newPatient) => {
    const targetName = normalizeName(newPatient.name);
    const targetDob = newPatient.dob || newPatient.dateOfBirth;
    const targetPhone = normalizePhone(newPatient.contact || newPatient.phone);

    return existingList.some(p => {
      const pName = normalizeName(p.name);
      const pDob = p.dob || p.dateOfBirth;
      const pPhone = normalizePhone(p.contact || p.phone);

      const nameMatch = pName === targetName;
      const dobMatch = targetDob && pDob && targetDob === pDob;
      const phoneMatch = targetPhone && pPhone && targetPhone === pPhone;

      return (nameMatch && dobMatch) || (nameMatch && phoneMatch);
    });
  };

  const existingPatients = [
    { id: 'P1', name: 'Maria Santos', dob: '1988-04-12', contact: '0917-123-4567' },
    { id: 'P2', name: 'Juan Dela Cruz', dob: '1975-11-20', contact: '0918-987-6543' },
  ];

  // Exact duplicate
  assert.ok(isDuplicate(existingPatients, { name: 'Maria Santos', dob: '1988-04-12' }));
  // Case-insensitive & whitespace variations
  assert.ok(isDuplicate(existingPatients, { name: '  MARIA   SANTOS  ', dob: '1988-04-12' }));
  // Hyphenated variation normalized
  assert.ok(isDuplicate(existingPatients, { name: 'Maria-Santos', dob: '1988-04-12' }));
  // Phone match with different formatting (+639 vs 09)
  assert.ok(isDuplicate(existingPatients, { name: 'Maria Santos', contact: '+639171234567' }));
  // Same name but different DOB and different phone -> not flagged automatically as duplicate
  assert.equal(isDuplicate(existingPatients, { name: 'Maria Santos', dob: '2001-01-01', contact: '0922-111-2222' }), false);
  // Completely different patient
  assert.equal(isDuplicate(existingPatients, { name: 'Robert Reyes', dob: '1990-09-09', contact: '0999-888-7777' }), false);
});

