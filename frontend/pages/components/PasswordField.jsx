import React, { useId, useState } from 'react';
import { PASSWORD_GUIDANCE } from '../../shared/formRules.mjs';

export default function PasswordField({ label = 'Password', value, onChange, required = true, confirmFor, current = false, className = 'medsec-field' }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const hint = `${id}-hint`;
  return <label className={className} htmlFor={id}><span>{label}{required && <> <span className="required-indicator" aria-hidden="true">*</span></>}</span>
    <div className="mv-password-wrap"><input id={id} type={visible ? 'text' : 'password'} required={required}
      autoComplete={current ? 'current-password' : 'new-password'} value={value} onChange={onChange}
      data-password-policy={!current && confirmFor === undefined ? 'true' : undefined}
      data-password-confirm={confirmFor !== undefined ? 'true' : undefined} aria-describedby={!current && confirmFor === undefined ? hint : undefined} />
      <button type="button" onClick={() => setVisible(show => !show)} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}
        </svg>
      </button>
    </div>
    {!current && confirmFor === undefined && <small id={hint} className="mv-field-hint">{PASSWORD_GUIDANCE}</small>}
  </label>;
}
