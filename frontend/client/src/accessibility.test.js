import test from 'node:test';
import assert from 'node:assert/strict';

test('accessibility: modal dialog attributes and keyboard escape contract', () => {
  // Simulates modal attributes contract
  const createModalProps = ({ _id, titleId, isOpen, onClose }) => {
    return {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      hidden: !isOpen,
      onKeyDown: (e) => {
        if (e.key === 'Escape' || e.code === 'Escape') {
          onClose();
        }
      },
    };
  };

  let closed = false;
  const props = createModalProps({
    id: 'mfa-modal',
    titleId: 'mfa-dialog-title',
    isOpen: true,
    onClose: () => { closed = true; },
  });

  assert.equal(props.role, 'dialog');
  assert.equal(props['aria-modal'], 'true');
  assert.equal(props['aria-labelledby'], 'mfa-dialog-title');
  assert.equal(props.hidden, false);

  // Trigger non-Escape key -> no close
  props.onKeyDown({ key: 'Tab' });
  assert.equal(closed, false);

  // Trigger Escape key -> closes modal
  props.onKeyDown({ key: 'Escape' });
  assert.equal(closed, true);
});

test('accessibility: alert banner role and aria-live announcements', () => {
  const createAlertProps = (severity = 'error') => {
    return {
      role: 'alert',
      'aria-live': severity === 'error' ? 'assertive' : 'polite',
      'aria-atomic': 'true',
    };
  };

  const errorAlert = createAlertProps('error');
  assert.equal(errorAlert.role, 'alert');
  assert.equal(errorAlert['aria-live'], 'assertive');
  assert.equal(errorAlert['aria-atomic'], 'true');

  const infoAlert = createAlertProps('info');
  assert.equal(infoAlert.role, 'alert');
  assert.equal(infoAlert['aria-live'], 'polite');
});

test('accessibility: form input labeling and validation feedback', () => {
  const createInputFieldProps = ({ id, label, isRequired, errorId, hasError }) => {
    return {
      id,
      name: id,
      'aria-label': label,
      'aria-required': isRequired ? 'true' : 'false',
      'aria-invalid': hasError ? 'true' : 'false',
      'aria-describedby': hasError ? errorId : undefined,
    };
  };

  const usernameField = createInputFieldProps({
    id: 'staff-username',
    label: 'Username',
    isRequired: true,
    errorId: 'staff-username-err',
    hasError: false,
  });

  assert.equal(usernameField.id, 'staff-username');
  assert.equal(usernameField['aria-required'], 'true');
  assert.equal(usernameField['aria-invalid'], 'false');
  assert.equal(usernameField['aria-describedby'], undefined);

  const errorField = createInputFieldProps({
    id: 'staff-username',
    label: 'Username',
    isRequired: true,
    errorId: 'staff-username-err',
    hasError: true,
  });

  assert.equal(errorField['aria-invalid'], 'true');
  assert.equal(errorField['aria-describedby'], 'staff-username-err');
});

test('accessibility: icon buttons have accessible text labels', () => {
  const validateButtonAccessibility = (button) => {
    // If the button has no visible children text, it MUST have aria-label or title
    const hasVisibleText = Boolean(button.text && button.text.trim().length > 0);
    const hasAriaLabel = Boolean(button['aria-label'] && button['aria-label'].trim().length > 0);
    const hasTitle = Boolean(button.title && button.title.trim().length > 0);
    return hasVisibleText || hasAriaLabel || hasTitle;
  };

  // Button with text
  assert.ok(validateButtonAccessibility({ text: 'Book Appointment' }));

  // Icon-only button with aria-label
  assert.ok(validateButtonAccessibility({ text: '', 'aria-label': 'Close dialog' }));

  // Icon-only button with title
  assert.ok(validateButtonAccessibility({ text: '', title: 'Delete patient record' }));

  // Inaccessible icon-only button (no text, no aria-label, no title)
  assert.equal(validateButtonAccessibility({ text: '', 'aria-label': '', title: '' }), false);
});
