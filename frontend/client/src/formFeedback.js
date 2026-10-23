import { isPersonName, NAME_GUIDANCE, passwordProblem, isPublicEmail, PHONE_PATTERN } from '../../shared/formRules.mjs';

const controls = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea';
const fieldGroups = '.form-field-group, .ap-form-field, .form-group, .form-field, .pm-form-group, .pm-form-field, .ap-inline-field, .ap-dropdown-section';
let sequence = 0;
const states = new Map();

function fieldLabel(field) {
  const label = field.labels?.[0] || field.closest('label') || field.closest(fieldGroups)?.querySelector('label');
  const caption = label?.cloneNode(true);
  caption?.querySelectorAll('input, select, textarea, button, small, .mv-inline-error, .required-indicator').forEach(node => node.remove());
  return { label, text: caption?.textContent?.replace(/\*/g, '').trim() || field.getAttribute('aria-label') || field.placeholder || 'This field' };
}

export function fieldProblem(field) {
  if (field.disabled || field.readOnly) return '';
  const { text } = fieldLabel(field);
  const value = field.value;
  if (field.required && !value.trim()) return `${text} is required.`;
  if (!value && !field.validity.badInput) return '';
  if (field.dataset.passwordPolicy === 'true') return passwordProblem(value) || '';
  if (field.dataset.passwordConfirm === 'true') return value === field.closest('form')?.querySelector('[data-password-policy="true"]')?.value ? '' : 'Passwords must match.';
  if (field.dataset.personName === 'true' && !isPersonName(value)) return NAME_GUIDANCE;
  if (field.type === 'email' && !isPublicEmail(value)) return 'Use a supported public email domain, such as gmail.com, yahoo.com, or outlook.com.';
  if (field.pattern === PHONE_PATTERN && !new RegExp(`^(?:${PHONE_PATTERN})$`).test(value)) return 'Use +63 XXX XXX XXXX, for example +63 917 123 4567.';
  const validity = field.validity;
  if (validity.badInput) return 'Enter a valid value.';
  if (validity.patternMismatch) return field.title || `Enter a valid ${text.toLowerCase()}.`;
  if (validity.typeMismatch) return `Enter a valid ${text.toLowerCase()}.`;
  if (validity.tooShort || (field.minLength > 0 && value.length < field.minLength)) return `Use at least ${field.minLength} characters.`;
  if (validity.tooLong || (field.maxLength > 0 && value.length > field.maxLength)) return `Use at most ${field.maxLength} characters.`;
  if (validity.rangeUnderflow) return `Choose a value on or after ${field.min}, or at least ${field.min}.`;
  if (validity.rangeOverflow) return `Choose a value on or before ${field.max}, or at most ${field.max}.`;
  if (validity.stepMismatch) return `Use increments of ${field.step || 1}.`;
  return '';
}

export function firstUnresolvedField() {
  for (const [field, state] of states) {
    if (field.isConnected && state.touched && fieldProblem(field)) return field;
  }
  return null;
}

// A delegated adapter covers the existing form components, including dynamically opened dialogs.
// It owns only its hint/marker nodes; React continues to own all values and field labels.
export function installFormFeedback(root = document) {
  let scanning = false;
  let active = true;
  const enhance = field => {
    if (!field.matches(controls)) return;
    let state = states.get(field);
    if (!state) {
      state = { touched: false, originalDescription: field.getAttribute('aria-describedby') || '' };
      states.set(field, state);
    }
    const { label, text } = fieldLabel(field);
    if (!field.disabled && !field.readOnly && field.tagName === 'INPUT' && ['text', ''].includes(field.type) &&
      /^(?:(?:emergency|emerg) contact |emergency |emerg )?(?:first |middle |last |patient |doctor |full )?name(?:\s*\(optional\))?$/i.test(text)) field.dataset.personName = 'true';
    if (label && field.required && !label.querySelector('.required-indicator, .required, .required-star') && !label.textContent.includes('*')) {
      const marker = document.createElement('span');
      marker.className = 'required-indicator'; marker.textContent = ' *'; marker.setAttribute('aria-hidden', 'true');
      const heading = label.querySelector('span') || label;
      heading.append(marker); state.marker = marker;
    }
    if (state.marker && !field.required) { state.marker.remove(); state.marker = null; }
    const problem = state.touched ? fieldProblem(field) : '';
    field.setAttribute('aria-invalid', problem ? 'true' : 'false');
    if (problem) {
      if (!state.hint?.isConnected) {
        state.hint = document.createElement('small'); state.hint.className = 'mv-inline-error'; state.hint.id = `mv-validation-${++sequence}`;
        state.hint.setAttribute('aria-live', 'polite');
        const host = field.closest(`label, ${fieldGroups}`) || field.parentElement;
        host.append(state.hint);
      }
      if (state.hint.textContent !== problem) state.hint.textContent = problem;
      field.setAttribute('aria-describedby', [state.originalDescription, state.hint.id].filter(Boolean).join(' '));
    } else if (state.hint) {
      state.hint.remove(); state.hint = null;
      if (state.originalDescription) field.setAttribute('aria-describedby', state.originalDescription); else field.removeAttribute('aria-describedby');
    }
  };
  const scan = () => {
    if (scanning) return;
    scanning = true;
    for (const [field, state] of states) if (!field.isConnected) { state.hint?.remove(); states.delete(field); }
    root.querySelectorAll(controls).forEach(enhance);
    scanning = false;
  };
  const touch = event => {
    if (!event.target.matches?.(controls)) return;
    enhance(event.target); states.get(event.target).touched = true;
    // Re-evaluate confirmations whenever the original password changes.
    scan();
    // React may normalize a controlled input after this capture listener runs.
    queueMicrotask(() => { if (active) scan(); });
  };
  const submit = event => {
    const fields = [...event.target.querySelectorAll(controls)];
    fields.forEach(field => { enhance(field); states.get(field).touched = true; });
    scan();
    const invalid = fields.find(field => fieldProblem(field));
    if (invalid) { event.preventDefault(); event.stopImmediatePropagation(); invalid.focus(); }
  };
  const observer = new MutationObserver(scan);
  scan();
  observer.observe(root.body || root, { childList: true, subtree: true, attributes: true, attributeFilter: ['required', 'disabled', 'readonly', 'min', 'max', 'pattern'] });
  root.addEventListener('input', touch, true); root.addEventListener('change', touch, true);
  root.addEventListener('focusout', touch, true); root.addEventListener('invalid', touch, true);
  root.addEventListener('submit', submit, true);
  return () => {
    active = false;
    observer.disconnect();
    for (const [field, state] of states) {
      state.hint?.remove(); state.marker?.remove(); field.removeAttribute('aria-invalid');
      if (state.originalDescription) field.setAttribute('aria-describedby', state.originalDescription);
      else field.removeAttribute('aria-describedby');
    }
    states.clear();
    root.removeEventListener('input', touch, true); root.removeEventListener('change', touch, true);
    root.removeEventListener('focusout', touch, true); root.removeEventListener('invalid', touch, true);
    root.removeEventListener('submit', submit, true);
  };
}
