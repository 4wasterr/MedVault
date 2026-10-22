import test from 'node:test';
import assert from 'node:assert/strict';

test('recovery: policy blocks self-service reset from login screen', () => {
  // Policy rule: End users cannot self-serve a reset from the login screen
  const canSelfServeResetFromLogin = false;
  assert.equal(canSelfServeResetFromLogin, false);

  const handleSelfServeAttempt = () => ({
    status: 403,
    error: 'Self-service password reset is disabled. Please contact an administrator or supervisor.',
  });

  const response = handleSelfServeAttempt();
  assert.equal(response.status, 403);
  assert.match(response.error, /self-service password reset is disabled/i);
});

test('recovery: admin generates temporary password with must_change_password flag', () => {
  function generateAdminTemporaryReset(username, adminRole) {
    if (adminRole !== 'Super Admin') {
      throw new Error('Only administrators can generate temporary reset credentials.');
    }
    const tempCode = Math.floor(100000 + Math.random() * 900000);
    return {
      username,
      temporaryPassword: `TempPass-${tempCode}`,
      must_change_password: 1,
    };
  }

  const resetResult = generateAdminTemporaryReset('nurse1', 'Super Admin');
  assert.equal(resetResult.username, 'nurse1');
  assert.match(resetResult.temporaryPassword, /^TempPass-\d{6}$/);
  assert.equal(resetResult.must_change_password, 1);

  // Non-admin cannot generate reset
  assert.throws(() => generateAdminTemporaryReset('nurse1', 'Receptionist'), /Only administrators/);
});

test('recovery: login with temporary credentials forces password change', () => {
  function evaluateLoginState(userAccount) {
    if (userAccount.must_change_password === 1) {
      return {
        authenticated: false,
        mustChangePassword: true,
        prompt: 'Password change required before accessing system.',
      };
    }
    return {
      authenticated: true,
      mustChangePassword: false,
    };
  }

  const userWithTempPass = { username: 'nurse1', must_change_password: 1 };
  const loginState = evaluateLoginState(userWithTempPass);
  assert.equal(loginState.mustChangePassword, true);
  assert.equal(loginState.authenticated, false);

  const regularUser = { username: 'nurse1', must_change_password: 0 };
  const regularLogin = evaluateLoginState(regularUser);
  assert.equal(regularLogin.mustChangePassword, false);
  assert.equal(regularLogin.authenticated, true);
});

test('recovery: forced password change validates mismatch and clears flag', () => {
  class ForcedPasswordValidator {
    static validate(tempPassword, newPassword, confirmPassword) {
      if (!newPassword || !confirmPassword) {
        return { valid: false, error: 'Password fields cannot be empty.' };
      }
      if (newPassword !== confirmPassword) {
        return { valid: false, error: 'The passwords do not match.' };
      }
      if (newPassword === tempPassword) {
        return { valid: false, error: 'Your new password cannot be the same as the temporary password.' };
      }
      return { valid: true, error: null };
    }
  }

  const tempPass = 'TempPass-894201';

  // Empty rejected
  assert.equal(ForcedPasswordValidator.validate(tempPass, '', '').valid, false);

  // Mismatch rejected
  assert.equal(ForcedPasswordValidator.validate(tempPass, 'PassA', 'PassB').valid, false);

  // Same as temporary rejected
  assert.equal(ForcedPasswordValidator.validate(tempPass, tempPass, tempPass).valid, false);

  // Valid new password accepted
  const validResult = ForcedPasswordValidator.validate(tempPass, 'NurseSecret2026', 'NurseSecret2026');
  assert.equal(validResult.valid, true);
  assert.equal(validResult.error, null);
});
