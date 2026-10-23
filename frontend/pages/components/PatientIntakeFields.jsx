import React from 'react';
import './PatientIntakeFields.css';
import { PHONE_PATTERN, RELATIONSHIPS, ageFromBirthday, formatPhone, phoneInput } from '../../shared/formRules.mjs';

export default function PatientIntakeFields({ value, onChange, className = 'ap-form-input' }) {
  return <>
    <label>Age *<input aria-label="Age" className={className} type="number" required min="0" max="130" step="1" readOnly={Boolean(value.birthday)} value={value.birthday ? ageFromBirthday(value.birthday) ?? '' : value.age ?? ''} onChange={e => onChange('age', e.target.value)} /></label>
    <fieldset className="ap-emergency-contact-fields">
      <legend>Emergency contact information</legend>
      <div className="ap-form-grid-2">
        <label>Emergency contact name<input aria-label="Emergency contact name" className={className} data-person-name="true" maxLength="160" value={value.emergencyName ?? ''} onChange={e => onChange('emergencyName', e.target.value)} /></label>
        <label>Emergency contact number *<input aria-label="Emergency contact number" className={className} type="tel" required pattern={PHONE_PATTERN} maxLength="16" placeholder="+63 917 123 4567" value={formatPhone(value.emergencyContact)} onChange={e => onChange('emergencyContact', phoneInput(e.target.value))} /></label>
        <label>Emergency contact relationship *<select aria-label="Emergency contact relationship" className={className} required value={value.emergencyRelationship ?? ''} onChange={e => onChange('emergencyRelationship', e.target.value)}><option value="">Select relationship</option>{RELATIONSHIPS.map(item => <option key={item}>{item}</option>)}</select></label>
      </div>
    </fieldset>
  </>;
}
