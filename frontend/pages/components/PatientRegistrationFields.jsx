import React from 'react';
import './PatientIdentityNotice.css';
import { PHONE_PATTERN, RELATIONSHIPS, SPECIALTIES, VISIT_TYPES, clinicToday, formatPhone, phoneInput, specialtyLabel } from '../../shared/formRules.mjs';
import { duplicatePatientMessage, findDuplicatePatient, registrationIdentity } from '../../shared/patientIdentity.mjs';

function TextField({ label, name, value, onChange, required = false, wide = false, type = 'text', ...props }) {
  return <label className={`pm-form-field${wide ? ' full-width' : ''}`}>
    <span className="pm-field-label">{label}{required && ' *'}</span>
    <input className="pm-form-input" type={type} {...props} required={required} name={name}
      value={type === 'tel' ? formatPhone(value) : value ?? ''}
      onChange={event => onChange(name, type === 'tel' ? phoneInput(event.target.value) : event.target.value)} />
  </label>;
}

// Both receptionist entry points share the same field order and validation rules.
export default function PatientRegistrationFields({ value, onChange, patients = [], onUseExisting }) {
  const duplicate = findDuplicatePatient(registrationIdentity(value), patients);
  const field = (name, label, props = {}) => <TextField key={name} name={name} label={label} value={value[name]} onChange={onChange} {...props} />;
  const phoneProps = { type: 'tel', required: true, pattern: PHONE_PATTERN, maxLength: 16, placeholder: '+63 917 123 4567' };
  return <>
    <h3 className="pm-form-section-title">Personal Information</h3>
    <div className="pm-form-grid-2">
      {field('firstName', 'First Name', { required: true, maxLength: 80, 'data-person-name': 'true' })}
      {field('lastName', 'Last Name', { required: true, maxLength: 80, 'data-person-name': 'true' })}
      {field('middleName', 'Middle Name (Optional)', { maxLength: 80, 'data-person-name': 'true' })}
      <label className="pm-form-field"><span className="pm-field-label">Sex *</span>
        <select name="sex" className="pm-form-select" required value={value.sex ?? ''} onChange={event => onChange('sex', event.target.value)}>
          <option value="">Select sex</option><option>Male</option><option>Female</option><option>Other</option>
        </select>
      </label>
      {field('age', 'Age', { type: 'number', min: 0, max: 130, step: 1, required: true })}
      {field('birthday', 'Birthday', { type: 'date', min: '1900-01-01', max: clinicToday() })}
      {field('contactNumber', 'Contact Number', phoneProps)}
      {field('email', 'Email', { type: 'email', placeholder: 'name@gmail.com' })}
      {field('address', 'Address', { required: true, wide: true, maxLength: 300 })}
    </div>
    {duplicate && <div className="pm-duplicate-patient" role="alert">
      <p>{duplicatePatientMessage(duplicate)}</p>
      {onUseExisting && <button type="button" className="pm-btn-cancel" onClick={() => onUseExisting(duplicate)}>Use existing patient</button>}
    </div>}

    <h3 className="pm-form-section-title">Visit Information</h3>
    <div className="pm-form-grid-2">
      <label className="pm-form-field"><span className="pm-field-label">Visit type *</span>
        <select name="type" className="pm-form-select" required value={value.type || 'Routine Checkup'} onChange={event => onChange('type', event.target.value)}>
          {VISIT_TYPES.map(type => <option key={type}>{type}</option>)}
        </select>
      </label>
      <label className="pm-form-field"><span className="pm-field-label">Specialty / service *</span>
        <select name="specialty" className="pm-form-select" required value={value.specialty || 'General Health'} onChange={event => onChange('specialty', event.target.value)}>
          {SPECIALTIES.map(specialty => <option key={specialty} value={specialty}>{specialtyLabel(specialty)}</option>)}
        </select>
      </label>
    </div>

    <h3 className="pm-form-section-title">Emergency Contact Information</h3>
    <div className="pm-form-grid-2">
      {field('emergFirstName', 'First Name (Optional)', { maxLength: 80, 'data-person-name': 'true' })}
      {field('emergLastName', 'Last Name (Optional)', { maxLength: 80, 'data-person-name': 'true' })}
      {field('emergMiddleName', 'Middle Name (Optional)', { maxLength: 80, 'data-person-name': 'true' })}
      {field('emergContactNumber', 'Emergency Contact Number', phoneProps)}
      <label className="pm-form-field full-width"><span className="pm-field-label">Emergency contact relationship *</span>
        <select name="emergencyRelationship" className="pm-form-select" required value={value.emergencyRelationship ?? ''} onChange={event => onChange('emergencyRelationship', event.target.value)}>
          <option value="">Select relationship</option>{RELATIONSHIPS.map(relationship => <option key={relationship}>{relationship}</option>)}
        </select>
      </label>
    </div>
  </>;
}
