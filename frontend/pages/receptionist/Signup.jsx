import { useDraftState } from '../../client/src/useDraftState';
import { EMAIL_PATTERN, PHONE_PATTERN, USERNAME_PATTERN, NAME_PATTERN, NAME_GUIDANCE, staffProblems, formatPhone, phoneInput } from '../../shared/formRules.mjs';
import PasswordField from '../components/PasswordField';
import React, { useState } from 'react';
import { api } from '../../client/src/sharedState';
import './Signup.css';

const emptyForm = {
  username: '', password: '', confirmPassword: '', firstName: '', middleName: '',
  lastName: '', address: '', phone: '', email: '', role: '',
};

export default function Signup({ onBack }) {
  const [form, setForm] = useDraftState('signup:form', emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (error) setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    const problems = staffProblems(form, { signup: true });
    if (Object.keys(problems).length) { setError(Object.values(problems)[0]); return; }
    setSubmitting(true);
    setError('');
    try {
      await api('register', { method: 'POST', body: JSON.stringify(form) });
      setForm(emptyForm);
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError.message || 'Unable to submit your request.');
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="login-card-wrapper signup-card-wrapper animate-card-entrance">
    <div className="login-card signup-card">
      {submitted ? <div className="signup-success" role="status">
        <span className="signup-success-icon" aria-hidden="true">✓</span>
        <h1>Request submitted</h1>
        <p>Your account is pending Super Admin approval. You can sign in after it is approved.</p>
        <button type="button" className="login-submit-btn" onClick={onBack}>Back to Login</button>
      </div> : <>
        <div className="signup-heading">
          <div className="signup-brand">MedVault <span aria-hidden="true">✚</span></div>
          <h1>Create your account</h1>
          <p>Request staff access. A Super Admin will review your details before your account is activated.</p>
        </div>
        <form className="signup-form" onSubmit={submit}>
          <h2>Login credentials</h2>
          <div className="signup-grid">
            <label className="signup-field"><span>Username *</span>
              <input required autoComplete="username" minLength={3} maxLength={32} pattern={USERNAME_PATTERN}
                title="Start with a letter; use 3–32 letters, numbers, dots, underscores, or hyphens."
                value={form.username} onChange={(event) => update('username', event.target.value)} placeholder="Choose a username" /></label>
            <div className="signup-field signup-field-empty" aria-hidden="true" />
            <PasswordField className="signup-field" value={form.password} onChange={event => update('password', event.target.value)} />
            <PasswordField className="signup-field" label="Confirm Password" value={form.confirmPassword} confirmFor={form.password} onChange={event => update('confirmPassword', event.target.value)} />
          </div>

          <h2>Personal details</h2>
          <div className="signup-grid">
            <label className="signup-field"><span>First name *</span><input required pattern={NAME_PATTERN} title={NAME_GUIDANCE} maxLength={80} autoComplete="given-name"
              value={form.firstName} onChange={(event) => update('firstName', event.target.value)} placeholder="First name" /></label>
            <label className="signup-field"><span>Middle name <small>(optional)</small></span><input pattern={NAME_PATTERN} title={NAME_GUIDANCE} maxLength={80} autoComplete="additional-name"
              value={form.middleName} onChange={(event) => update('middleName', event.target.value)} placeholder="Middle name" /></label>
            <label className="signup-field"><span>Last name *</span><input required pattern={NAME_PATTERN} title={NAME_GUIDANCE} maxLength={80} autoComplete="family-name"
              value={form.lastName} onChange={(event) => update('lastName', event.target.value)} placeholder="Last name" /></label>
            <label className="signup-field"><span>Phone number *</span><input required type="tel" pattern={PHONE_PATTERN} maxLength="16" placeholder="+63 917 123 4567" autoComplete="tel"
              value={formatPhone(form.phone)} onChange={(event) => update('phone', phoneInput(event.target.value))} /></label>
            <label className="signup-field signup-wide"><span>Email *</span><input required type="email" pattern={EMAIL_PATTERN} title="Use a public email domain such as gmail.com, yahoo.com, or outlook.com" maxLength={254} autoComplete="email"
              value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="name@gmail.com" /></label>
            <label className="signup-field signup-wide"><span>Address *</span><textarea required maxLength={300} autoComplete="street-address"
              value={form.address} onChange={(event) => update('address', event.target.value)} placeholder="Complete address" rows={2} /></label>
            <label className="signup-field signup-wide"><span>Requested role *</span><select required value={form.role} onChange={(event) => update('role', event.target.value)}>
              <option value="">Choose a role</option><option value="Receptionist">Receptionist</option><option value="Medical Secretary">Medical Secretary</option>
            </select></label>
          </div>
          <p className="signup-approval-note">Your request will be reviewed before your login is enabled.</p>
          {error && <p className="signup-error" role="alert">{error}</p>}
          <button className="login-submit-btn signup-submit" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Request Account'}</button>
          <p className="signup-login-link">Already have an account? <button type="button" onClick={onBack}>Back to Login</button></p>
        </form>
      </>}
    </div>
  </div>;
}
