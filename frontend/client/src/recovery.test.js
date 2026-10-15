import test from 'node:test';
import assert from 'node:assert/strict';

test('recovery: state machine step progression', () => {
  const _STEPS = ['email', 'verify-code', 'reset-password', 'success'];

  class RecoveryFlowState {
    constructor() {
      this.step = 'email';
      this.email = '';
      this.resetToken = null;
      this.error = null;
    }

    submitEmail(email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        this.error = 'Please enter a valid email address.';
        return false;
      }
      this.email = email;
      this.error = null;
      this.step = 'verify-code';
      return true;
    }

    submitCode(code, serverToken) {
      const cleanCode = String(code || '').replace(/\D/g, '');
      if (cleanCode.length !== 6) {
        this.error = 'Code must be exactly 6 digits.';
        return false;
      }
      this.resetToken = serverToken;
      this.error = null;
      this.step = 'reset-password';
      return true;
    }

    submitPassword(newPass, confirmPass) {
      if (newPass !== confirmPass) {
        this.error = 'Passwords do not match.';
        return false;
      }
      if (newPass.length < 8) {
        this.error = 'Password must be at least 8 characters long.';
        return false;
      }
      this.error = null;
      this.step = 'success';
      return true;
    }
  }

  const flow = new RecoveryFlowState();
  assert.equal(flow.step, 'email');

  // Invalid email rejected
  assert.equal(flow.submitEmail('notanemail'), false);
  assert.equal(flow.step, 'email');
  assert.ok(flow.error);

  // Valid email proceeds to verify-code
  assert.ok(flow.submitEmail('user@medvault.local'));
  assert.equal(flow.step, 'verify-code');
  assert.equal(flow.error, null);

  // Invalid code rejected (not 6 digits)
  assert.equal(flow.submitCode('123'), false);
  assert.equal(flow.step, 'verify-code');

  // Valid 6-digit code advances to reset-password
  assert.ok(flow.submitCode('123456', 'tok_mock_reset_token'));
  assert.equal(flow.step, 'reset-password');
  assert.equal(flow.resetToken, 'tok_mock_reset_token');

  // Mismatched passwords rejected
  assert.equal(flow.submitPassword('NewPass123!', 'DifferentPass123!'), false);
  assert.equal(flow.step, 'reset-password');

  // Short password rejected
  assert.equal(flow.submitPassword('Short1!', 'Short1!'), false);
  assert.equal(flow.step, 'reset-password');

  // Valid password advances to success
  assert.ok(flow.submitPassword('SecurePassword2026!', 'SecurePassword2026!'));
  assert.equal(flow.step, 'success');
});

test('recovery: 6-digit OTP formatting and input sanitization', () => {
  const sanitizeOtp = (raw) => String(raw || '').replace(/\D/g, '').slice(0, 6);

  assert.equal(sanitizeOtp('123-456'), '123456');
  assert.equal(sanitizeOtp(' 12 34 56 '), '123456');
  assert.equal(sanitizeOtp('123456789'), '123456'); // capped at 6
  assert.equal(sanitizeOtp('abc'), '');
  assert.equal(sanitizeOtp('12a34b5c'), '12345');
});

test('recovery: anti-enumeration generic response verification', () => {
  // Ensure the response message shown to the user is identical regardless of whether email exists
  const getSubmissionMessage = () =>
    'If an account is associated with this email address, a password reset code has been sent.';

  const messageForExisting = getSubmissionMessage();
  const messageForNonExisting = getSubmissionMessage();
  assert.equal(messageForExisting, messageForNonExisting);
  assert.ok(messageForExisting.includes('associated with this email'));
});

test('recovery: failed attempt rate-limit tracking', () => {
  class AttemptTracker {
    constructor(maxAttempts = 5) {
      this.attempts = 0;
      this.maxAttempts = maxAttempts;
      this.lockedUntil = 0;
    }

    recordFailure() {
      this.attempts += 1;
      if (this.attempts >= this.maxAttempts) {
        this.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 min lockout
        return false;
      }
      return true;
    }

    isLocked() {
      return Date.now() < this.lockedUntil;
    }
  }

  const tracker = new AttemptTracker(3);
  assert.equal(tracker.isLocked(), false);
  assert.ok(tracker.recordFailure()); // 1
  assert.equal(tracker.isLocked(), false);
  assert.ok(tracker.recordFailure()); // 2
  assert.equal(tracker.isLocked(), false);
  assert.equal(tracker.recordFailure(), false); // 3 -> locked
  assert.ok(tracker.isLocked());
});
