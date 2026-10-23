import React from 'react';
import { PHONE_PATTERN, RELATIONSHIPS } from '../../shared/formRules.mjs';

export default function PatientIntakeFields({ value, onChange, className = 'ap-form-input' }) {
  return <>
    <label>Age *<input aria-label="Age" className={className} type="number" required min="0" max="130" step="1" value={value.age ?? ''} onChange={e => onChange('age', e.target.value)} /></label>
    <label>Emergency contact name<input aria-label="Emergency contact name" className={className} value={value.emergencyName ?? ''} onChange={e => onChange('emergencyName', e.target.value)} /></label>
    <label>Emergency contact number *<input aria-label="Emergency contact number" className={className} type="tel" required pattern={PHONE_PATTERN} maxLength="13" placeholder="+639171234567" value={value.emergencyContact ?? ''} onChange={e => onChange('emergencyContact', e.target.value)} /></label>
    <label>Emergency contact relationship *<select aria-label="Emergency contact relationship" className={className} required value={value.emergencyRelationship ?? ''} onChange={e => onChange('emergencyRelationship', e.target.value)}><option value="">Select relationship</option>{RELATIONSHIPS.map(item => <option key={item}>{item}</option>)}</select></label>
  </>;
}
