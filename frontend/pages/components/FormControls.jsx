import React, { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { nameProblem, passwordProblem, usernameProblem } from '../../shared/formRules.mjs';

export function fieldProblem(value, props) {
  const text = String(value ?? '');
  if (!text) return props.required ? 'This field is required.' : '';
  if (props.validation === 'name') return nameProblem(text, { required: props.required }) || '';
  if (props.validation === 'username') return usernameProblem(text) || '';
  if (props.validation === 'password') return passwordProblem(text) || '';
  if (props.matchValue !== undefined && text !== props.matchValue) return 'Passwords do not match.';
  if (props.validate) return props.validate(text) || '';
  if (props.minLength && text.length < Number(props.minLength)) return `Enter at least ${props.minLength} characters.`;
  if (props.maxLength && text.length > Number(props.maxLength)) return `Enter no more than ${props.maxLength} characters.`;
  if (props.pattern) {
    try { if (!new RegExp(`^(?:${props.pattern})$`, 'u').test(text)) return props.title || 'Use the required format.'; } catch { /* Browser validity is also checked on input. */ }
  }
  if (props.type === 'number') {
    const number = Number(text);
    if (!Number.isFinite(number) || !/^\d+(?:\.\d+)?$/.test(text)) return 'Enter a valid number.';
    if (props.min !== undefined && number < Number(props.min)) return `Enter ${props.min} or more.`;
    if (props.max !== undefined && number > Number(props.max)) return `Enter ${props.max} or less.`;
    if (props.step && props.step !== 'any') {
      const steps = (number - Number(props.min || 0)) / Number(props.step);
      if (Math.abs(steps - Math.round(steps)) > 0.000001) return `Use increments of ${props.step}.`;
    }
  }
  if (props.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString().slice(0, 10) !== text) return 'Choose a valid date.';
    if (props.min && text < props.min) return `Choose ${props.min} or a later date.`;
    if (props.max && text > props.max) return `Choose ${props.max} or an earlier date.`;
  }
  if (props.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(text)) return 'Choose a valid time.';
  if (props.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return 'Enter a valid email address.';
  return '';
}

function Control({ as: Tag = 'input', validation, matchValue, validate, ...props }) {
  const generatedId = useId();
  const inputRef = useRef(null);
  const [touched, setTouched] = useState(false);
  const [uncontrolled, setUncontrolled] = useState(props.defaultValue ?? '');
  const value = props.value ?? uncontrolled;
  const problem = !props.readOnly && !props.disabled ? fieldProblem(value, { ...props, validation, matchValue, validate }) : '';
  const visible = Boolean(problem && (touched || String(value ?? '').length));
  const errorId = `${props.id || generatedId}-error`;
  useEffect(() => { inputRef.current?.setCustomValidity(problem); }, [problem]);
  const change = event => { setTouched(true); setUncontrolled(event.target.value); props.onChange?.(event); };
  return <>
    <Tag {...props} ref={inputRef} id={props.id || generatedId} aria-invalid={visible ? 'true' : props['aria-invalid']}
      aria-describedby={[props['aria-describedby'], visible ? errorId : ''].filter(Boolean).join(' ') || undefined}
      onChange={change} onBlur={event => { setTouched(true); props.onBlur?.(event); }}
      onInvalid={event => { setTouched(true); props.onInvalid?.(event); }} />
    {visible && <small className="mv-inline-error" id={errorId} role="status">{problem}</small>}
  </>;
}
export const Input = props => <Control {...props} />;
export const Select = props => <Control {...props} as="select" />;
export const Textarea = props => <Control {...props} as="textarea" />;

function requiredControl(children) {
  return Children.toArray(children).some(child => isValidElement(child) && (child.props.required || requiredControl(child.props.children)));
}
function markStars(children) {
  return Children.map(children, child => typeof child === 'string' ? child.split(/(\*)/).map((part, index) => part === '*'
    ? <span key={index} className="mv-required" aria-hidden="true">*</span> : part)
    : isValidElement(child) && child.props.children ? cloneElement(child, {}, markStars(child.props.children)) : child);
}
function labelText(children) {
  return Children.toArray(children).map(child => typeof child === 'string' ? child : isValidElement(child) && typeof child.type === 'string' && !['input', 'select', 'textarea'].includes(child.type) ? labelText(child.props.children) : '').join('');
}
export function Label({ children, required, ...props }) {
  const text = labelText(children);
  const needsStar = (required || requiredControl(children)) && !text.includes('*');
  let content = markStars(children);
  if (needsStar) {
    const array = Children.toArray(content);
    const first = array[0];
    const star = <span className="mv-required" aria-hidden="true"> *</span>;
    if (isValidElement(first) && ['span', 'div'].includes(first.type)) array[0] = cloneElement(first, {}, first.props.children, star);
    else array.splice(1, 0, star);
    content = array;
  }
  return <label {...props}>{content}</label>;
}

export function EyeIcon({ hidden }) {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{hidden && <path d="M3 3l18 18" />}</svg>;
}
export function PasswordField({ label = 'Password', value, onChange, confirmFor, required = true, ...props }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return <Label className="mv-password-field" htmlFor={id} required={required}><span>{label}</span><div className="mv-password-wrap">
    <Input {...props} id={id} required={required} validation={confirmFor === undefined ? 'password' : undefined} matchValue={confirmFor} type={visible ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={onChange} />
    <button type="button" className="mv-eye" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(current => !current)}><EyeIcon hidden={visible} /></button>
  </div></Label>;
}
