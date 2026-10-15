import React, { useState, useEffect, useRef } from 'react';
import './login.css';
import doctorImg from './images/doctor.png';
import slideClipboard from './images/slide_clipboard.png';
import slideNurses from './images/slide_nurses.png';
import slideXray from './images/slide_xray.png';
import slideSurgery from './images/slide_surgery.png';
import { api } from '../../client/src/sharedState';
import Signup from './Signup';

const SLIDES = [
  {
    src: doctorImg,
    alt: 'MedVault Doctor and Senior Patient',
    position: 'center 15%',
    tagline: (
      <>
        Keeping your waiting room smart, secure,
        <br />
        and synchronized.
      </>
    ),
  },
  {
    src: slideClipboard,
    alt: 'Nurse Reviewing Clinical Records',
    position: 'center 20%',
    tagline: (
      <>
        Accurate clinical charting and patient care,
        <br />
        simplified at every step.
      </>
    ),
  },
  {
    src: slideNurses,
    alt: 'Nursing Staff Coordination',
    position: 'center 15%',
    tagline: (
      <>
        Seamless coordination between nurses, doctors,
        <br />
        and hospital departments.
      </>
    ),
  },
  {
    src: slideXray,
    alt: 'Physicians Reviewing Radiology Diagnostic Scans',
    position: 'center 20%',
    tagline: (
      <>
        Instant diagnostic insights and verified vitals
        <br />
        at your fingertips.
      </>
    ),
  },
  {
    src: slideSurgery,
    alt: 'Surgical Team Operating Room Procedure',
    position: 'center 28%',
    tagline: (
      <>
        Precision healthcare workflow from triage
        <br />
        to surgical recovery.
      </>
    ),
  },
];

function RecoveryIcon({ name }) {
  if (name === 'mail') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" />
  </svg>;
  if (name === 'lock') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <rect x="5" y="10" width="14" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="M2.5 12s3.5-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.5 5.5-9.5 5.5S2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>;
}

function ForgotPasswordFlow({ onClose }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const digitRefs = useRef([]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const sendCode = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await api('auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      setDigits(['', '', '', '', '', '']);
      setStep('verify');
      requestAnimationFrame(() => digitRefs.current[0]?.focus());
    } catch (err) {
      setError(err.message || 'Unable to process password reset request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateDigit = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((current) => current.map((item, itemIndex) => itemIndex === index ? digit : item));
    setError('');
    if (digit && index < 5) digitRefs.current[index + 1]?.focus();
  };

  const pasteCode = (event) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    setDigits(Array.from({ length: 6 }, (_, index) => pasted[index] || ''));
    setError('');
    digitRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    const code = digits.join('');
    if (code.length < 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const result = await api('auth/verify-reset-code', { method: 'POST', body: JSON.stringify({ email, code }) });
      setResetToken(result.resetToken);
      setStep('password');
    } catch (err) {
      setError(err.message || 'Invalid or expired verification code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendCode = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      await api('auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      setDigits(['', '', '', '', '', '']);
      digitRefs.current[0]?.focus();
    } catch (err) {
      setError(err.message || 'Unable to resend verification code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const finishReset = async (event) => {
    event.preventDefault();
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError('Use at least 8 characters, including a letter and a number.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await api('auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, resetToken, newPassword, confirmPassword }),
      });
      setNewPassword('');
      setConfirmPassword('');
      setStep('complete');
    } catch (err) {
      setError(err.message || 'Unable to reset password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const goBack = () => {
    setError('');
    if (step === 'email' || step === 'complete') onClose();
    else setStep(step === 'password' ? 'verify' : 'email');
  };

  const title = {
    email: 'Forgot Password',
    verify: 'Verify your account',
    password: 'Create New Password',
    complete: 'Password Reset Complete',
  }[step];

  return <div className="recovery-backdrop animate-fade-in" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="recovery-panel animate-slide-up" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
      <div className="recovery-topline"><span>MedVault</span><span aria-hidden="true">🔒 Security</span></div>
      <div className="recovery-nav">
        <button type="button" className="recovery-back" onClick={goBack} aria-label={step === 'email' ? 'Back to login' : 'Previous step'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12" /></svg>
        </button>
        <span className="recovery-brand"><span aria-hidden="true">✚</span> MedVault</span>
      </div>
      <div className="recovery-content" key={step}>
        <p className="recovery-kicker">Secure account access</p>
        <h2 id="recovery-title">{title}</h2>
        {step === 'email' && <>
          <p className="recovery-subtitle">Enter your registered email address to receive a secure 6-digit verification code.</p>
          <form onSubmit={sendCode}>
            <label className="recovery-label" htmlFor="recovery-email">Email Address</label>
            <div className="recovery-input-wrap"><RecoveryIcon name="mail" />
              <input id="recovery-email" type="email" required autoComplete="email" autoFocus placeholder="Enter your email"
                value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <button className="recovery-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Sending Code...' : 'Send Verification Code'}
            </button>
          </form>
        </>}
        {step === 'verify' && <>
          <p className="recovery-subtitle">Enter the 6-digit verification code sent to <strong>{email}</strong>.</p>
          <form onSubmit={verifyCode}>
            <div className="recovery-otp" role="group" aria-label="Six-digit verification code">
              {digits.map((digit, index) => <input key={index} ref={(node) => { digitRefs.current[index] = node; }}
                aria-label={`Digit ${index + 1}`} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={1} value={digit} onChange={(event) => updateDigit(index, event.target.value)}
                onPaste={pasteCode} onKeyDown={(event) => {
                  if (event.key === 'Backspace' && !digit && index > 0) digitRefs.current[index - 1]?.focus();
                  if (event.key === 'ArrowLeft' && index > 0) digitRefs.current[index - 1]?.focus();
                  if (event.key === 'ArrowRight' && index < 5) digitRefs.current[index + 1]?.focus();
                }} />)}
            </div>
            <button className="recovery-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Verifying...' : 'Verify Code'}
            </button>
          </form>
          <p className="recovery-resend">Didn't receive code? <button type="button" onClick={resendCode} disabled={isSubmitting}>Resend Code</button></p>
        </>}
        {step === 'password' && <>
          <p className="recovery-subtitle">Set a strong new password (at least 8 characters, with letters and numbers).</p>
          <form onSubmit={finishReset}>
            <label className="recovery-label" htmlFor="recovery-password">New Password</label>
            <div className="recovery-input-wrap"><RecoveryIcon name="lock" />
              <input id="recovery-password" type={showNewPassword ? 'text' : 'password'} required autoComplete="new-password"
                placeholder="Enter your new password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setError(''); }} />
              <button type="button" className="recovery-eye" onClick={() => setShowNewPassword((visible) => !visible)}
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}><RecoveryIcon name="eye" /></button>
            </div>
            <label className="recovery-label" htmlFor="recovery-confirm">Confirm New Password</label>
            <div className="recovery-input-wrap"><RecoveryIcon name="lock" />
              <input id="recovery-confirm" type={showConfirmPassword ? 'text' : 'password'} required autoComplete="new-password"
                placeholder="Confirm your new password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(''); }} />
              <button type="button" className="recovery-eye" onClick={() => setShowConfirmPassword((visible) => !visible)}
                aria-label={showConfirmPassword ? 'Hide confirmation' : 'Show confirmation'}><RecoveryIcon name="eye" /></button>
            </div>
            <button className="recovery-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Updating Password...' : 'Save New Password'}
            </button>
          </form>
        </>}
        {step === 'complete' && <div className="recovery-complete">
          <span className="recovery-complete-icon" aria-hidden="true">✓</span>
          <p>Your password has been reset successfully. You can now log in to MedVault with your new credentials.</p>
          <button className="recovery-primary" type="button" onClick={onClose}>Back to Login</button>
        </div>}
        {error && <p className="recovery-error" role="alert">{error}</p>}
      </div>
    </section>
  </div>;
}

function MfaPromptModal({ mfaData, onSuccess, onCancel }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Please enter your 6-digit authenticator code or 8-character backup code.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const result = await api('auth/mfa/login', {
        method: 'POST',
        body: JSON.stringify({ tempToken: mfaData.tempToken, code: code.trim() }),
      });
      onSuccess(result.role, result.username);
    } catch (err) {
      setError(err.message || 'Invalid authentication code or backup code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="recovery-backdrop animate-fade-in" role="presentation">
      <section className="recovery-panel animate-slide-up" role="dialog" aria-modal="true" aria-labelledby="mfa-title">
        <div className="recovery-topline"><span>MedVault</span><span aria-hidden="true">🔒 MFA Protection</span></div>
        <div className="recovery-content">
          <p className="recovery-kicker">Multi-Factor Authentication</p>
          <h2 id="mfa-title">Security Verification</h2>
          <p className="recovery-subtitle">
            Enter the 6-digit code from your authenticator app, or enter an emergency backup code to complete sign in.
          </p>
          <form onSubmit={handleSubmit}>
            <label className="recovery-label" htmlFor="mfa-code">Verification Code</label>
            <div className="recovery-input-wrap">
              <RecoveryIcon name="lock" />
              <input
                id="mfa-code"
                type="text"
                autoFocus
                autoComplete="one-time-code"
                placeholder="6-digit code or backup code"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(''); }}
              />
            </div>
            {error && <p className="recovery-error" role="alert" style={{ marginTop: '12px' }}>{error}</p>}
            <button className="recovery-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Verifying...' : 'Verify & Sign In'}
            </button>
            <button
              type="button"
              className="recovery-primary"
              style={{ background: '#f1f5f9', color: '#475569', boxShadow: 'none', marginTop: '10px' }}
              onClick={onCancel}
            >
              Cancel
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

export default function Login({ onLoginSuccess }) {
  const [authPage, setAuthPage] = useState(() => new URLSearchParams(window.location.search).get('view') === 'signup' ? 'signup' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ username: '', password: '', general: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authenticatedRole, setAuthenticatedRole] = useState(null);
  const [modalType, setModalType] = useState(null); // 'forgot' | null
  const [shakeField, setShakeField] = useState(null);
  const [mfaData, setMfaData] = useState(null);

  // Slideshow State with persistence
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlayPaused, setIsAutoPlayPaused] = useState(() => {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem('medvault_slideshow_paused') === 'true';
    } catch {
      return false;
    }
  });
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const syncPage = () => setAuthPage(new URLSearchParams(window.location.search).get('view') === 'signup' ? 'signup' : 'login');
    window.addEventListener('popstate', syncPage);
    return () => window.removeEventListener('popstate', syncPage);
  }, []);

  const showAuthPage = (page) => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', page);
    window.history.pushState({ view: page }, '', url);
    setAuthPage(page);
  };

  useEffect(() => {
    if (isAutoPlayPaused || isHovered) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SLIDES.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [isAutoPlayPaused, isHovered]);

  const togglePlayPause = (e) => {
    if (e) e.stopPropagation();
    setIsAutoPlayPaused((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('medvault_slideshow_paused', String(next));
      } catch {
        // ignore storage error
      }
      return next;
    });
  };

  const goToPrevSlide = (e) => {
    e.stopPropagation();
    setCurrentSlide((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
  };

  const goToNextSlide = (e) => {
    e.stopPropagation();
    setCurrentSlide((prev) => (prev + 1) % SLIDES.length);
  };

  // Simple client-side validations
  const validateForm = () => {
    const newErrors = { username: '', password: '', general: '' };
    let isValid = true;

    if (!username.trim()) {
      newErrors.username = 'Please enter your username.';
      isValid = false;
      setShakeField('username');
    } else if (username.trim().length < 3) {
      newErrors.username = 'Username must be at least 3 characters.';
      isValid = false;
      setShakeField('username');
    }

    if (!password) {
      newErrors.password = 'Please enter your password.';
      isValid = false;
      if (isValid) setShakeField('password');
    } else if (password.length < 4) {
      newErrors.password = 'Password must be at least 4 characters.';
      isValid = false;
      if (isValid) setShakeField('password');
    }

    setErrors(newErrors);

    if (!isValid) {
      setTimeout(() => setShakeField(null), 600);
    }

    return isValid;
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({ username: '', password: '', general: '' });

    try {
      const result = await api('login', { method: 'POST', body: JSON.stringify({ username, password }) });
      setIsSubmitting(false);
      if (result.mfaRequired) {
        setMfaData(result);
        return;
      }
      setIsLoggedIn(true);
      setAuthenticatedRole(result.role);
      if (onLoginSuccess) {
        setTimeout(() => {
          onLoginSuccess(result.role, result.username);
        }, 1400);
      }
    } catch (error) {
      setIsSubmitting(false);
      setErrors({ username: '', password: '', general: error.message });
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setAuthenticatedRole(null);
    setPassword('');
    setErrors({ username: '', password: '', general: '' });
  };

  return (
    <div className="medvault-login-page">
      {/* LEFT SECTION: Hero Image Slideshow & Branding Overlay */}
      <div
        className={`login-left-section ${isAutoPlayPaused ? 'is-slideshow-paused' : ''}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        role="region"
        aria-label="Medical slideshow"
      >
        {SLIDES.map((slide, idx) => (
          <div
            key={idx}
            className={`slideshow-slide ${idx === currentSlide ? 'active' : ''}`}
            aria-hidden={idx !== currentSlide}
          >
            <img
              src={slide.src}
              alt={slide.alt}
              className="slideshow-slide-img"
              style={{ objectPosition: slide.position || 'center 20%' }}
            />
          </div>
        ))}

        {/* Previous / Next Arrow Controls */}
        <button
          type="button"
          className="slide-arrow-btn slide-arrow-prev"
          onClick={goToPrevSlide}
          aria-label="Previous Slide"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          type="button"
          className="slide-arrow-btn slide-arrow-next"
          onClick={goToNextSlide}
          aria-label="Next Slide"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Gradient Overlays */}
        <div className="left-gradient-overlay"></div>

        {/* Content & Tagline Overlay with Indicator Pills & Minimalist Pause Button */}
        <div className="left-content-overlay">
          <h2 className="left-hero-text">
            {SLIDES[currentSlide].tagline}
          </h2>

          {/* Minimalist Controls Bar */}
          <div className="slideshow-controls-bar">
            {/* Slideshow Indicator Dots */}
            <div className="slideshow-indicators" role="tablist" aria-label="Slide dots">
              {SLIDES.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  role="tab"
                  aria-selected={idx === currentSlide}
                  className={`slide-dot ${idx === currentSlide ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentSlide(idx);
                  }}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>

            {/* Minimalist Pause / Play Button */}
            <button
              type="button"
              className={`slideshow-pause-btn ${isAutoPlayPaused ? 'is-paused' : ''}`}
              onClick={togglePlayPause}
              aria-label={isAutoPlayPaused ? 'Resume slideshow auto-play' : 'Pause slideshow auto-play'}
              title={isAutoPlayPaused ? 'Resume slideshow' : 'Pause slideshow'}
            >
              {isAutoPlayPaused ? (
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                  <polygon points="6,4 20,12 6,20" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                  <rect x="5.5" y="4" width="3.5" height="16" rx="1.2" />
                  <rect x="15" y="4" width="3.5" height="16" rx="1.2" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT SECTION: Login Form & Authenticated View */}
      <div className={`login-right-section ${authPage === 'signup' ? 'signup-right-section' : ''}`}>
        {/* Minimalist Blue Geometric Animated Background */}
        <div className="geometric-bg-container" aria-hidden="true">
          {/* Ambient Glowing Orbs */}
          <div className="geo-shape shape-glow-orb glow-orb-1"></div>
          <div className="geo-shape shape-glow-orb glow-orb-2"></div>
          <div className="geo-shape shape-glow-orb glow-orb-3"></div>

          {/* Minimalist Medical Crosses */}
          <div className="geo-shape shape-cross cross-top-left">
            <svg viewBox="0 0 24 24" width="34" height="34" stroke="#00ADEF" strokeWidth="2.4" fill="none">
              <line x1="12" y1="4" x2="12" y2="20" />
              <line x1="4" y1="12" x2="20" y2="12" />
            </svg>
          </div>
          <div className="geo-shape shape-cross cross-bottom-right">
            <svg viewBox="0 0 24 24" width="28" height="28" stroke="#00ADEF" strokeWidth="2.2" fill="none">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div className="geo-shape shape-cross cross-center-right">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="#00ADEF" strokeWidth="2.2" fill="none">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>

          {/* Geometric Circles and Rings */}
          <div className="geo-shape shape-ring ring-large"></div>
          <div className="geo-shape shape-ring ring-medium"></div>
          <div className="geo-shape shape-ring ring-small"></div>
          <div className="geo-shape shape-dot dot-1"></div>
          <div className="geo-shape shape-dot dot-2"></div>
          <div className="geo-shape shape-dot dot-3"></div>

          {/* Floating Pill & Minimalist Polygons */}
          <div className="geo-shape shape-pill pill-top-right"></div>
          <div className="geo-shape shape-rhombus rhombus-bottom-left"></div>

          {/* Subtle Dot Matrix Accent */}
          <div className="geo-shape shape-dot-matrix matrix-top"></div>
          <div className="geo-shape shape-dot-matrix matrix-bottom"></div>
        </div>

        {authPage === 'signup' ? <Signup onBack={() => showAuthPage('login')} /> : !isLoggedIn ? (
          <div className="login-card-wrapper animate-card-entrance">
            <div className="login-card">
              {/* Header / Brand Title */}
              <div className="card-header animate-item-1">
                <h1 className="welcome-title">Welcome to</h1>
                <div className="brand-name-row">
                  <span className="brand-name">MedVault</span>
                  <span className="brand-cross-icon" title="MedVault Care">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                      <circle cx="12" cy="12" r="10" fill="#00ADEF" />
                      <path
                        d="M12 7v10M7 12h10"
                        stroke="#ffffff"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </div>
                <p className="card-subtitle">Log your credentials here.</p>
              </div>

              {/* General Error Banner if needed */}
              {errors.general && (
                <div className="form-error-banner animate-fade-in">
                  <span>{errors.general}</span>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleLogin} className="medvault-form" noValidate>
                {/* Username Field */}
                <div className={`form-field-group animate-item-2 ${shakeField === 'username' ? 'field-shake' : ''}`}>
                  <div className={`input-pill-container ${errors.username ? 'input-error' : ''}`}>
                    <span className="input-icon user-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="#00ADEF">
                        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      className="pill-input"
                      placeholder="Enter your username"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (errors.username) setErrors({ ...errors, username: '' });
                      }}
                      autoComplete="username"
                    />
                  </div>
                  {errors.username && (
                    <span className="inline-error-text animate-fade-in">{errors.username}</span>
                  )}
                </div>

                {/* Password Field */}
                <div className={`form-field-group animate-item-3 ${shakeField === 'password' ? 'field-shake' : ''}`}>
                  <div className={`input-pill-container ${errors.password ? 'input-error' : ''}`}>
                    <span className="input-icon lock-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="#00ADEF">
                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                      </svg>
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="pill-input"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errors.password) setErrors({ ...errors, password: '' });
                      }}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="eye-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        /* Slashed Eye */
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#00ADEF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        /* Open Eye */
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#00ADEF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" fill="#00ADEF" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <span className="inline-error-text animate-fade-in">{errors.password}</span>
                  )}
                </div>

                {/* Forgot Password Link */}
                <div className="forgot-password-row animate-item-4">
                  <button
                    type="button"
                    className="forgot-password-link"
                    onClick={() => setModalType('forgot')}
                  >
                    Forgot Password
                  </button>
                </div>

                {/* Submit Button */}
                <div className="submit-btn-row animate-item-5">
                  <button
                    type="submit"
                    className={`login-submit-btn ${isSubmitting ? 'submitting' : ''}`}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <span className="btn-spinner-content">
                        <span className="spinner-ring"></span>
                        Logging in...
                      </span>
                    ) : (
                      'Login'
                    )}
                  </button>
                </div>

                {/* Footer Link: Sign Up */}
                <div className="signup-prompt-row animate-item-6">
                  <span className="dont-have-account-text">Don't have an account? </span>
                  <button
                    type="button"
                    className="signup-link"
                    onClick={() => showAuthPage('signup')}
                  >
                    Sign up here
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          /* Post-Login Slide-In Dashboard Transition (Welcome Back Animation) */
          <div className="login-card-wrapper animate-slide-in-success">
            <div className="login-card success-card">
              <div className="success-badge-icon animate-bounce-in">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none">
                  <circle cx="12" cy="12" r="10" fill="#00ADEF" />
                  <path
                    d="M8 12.5l2.5 2.5 5.5-5.5"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h2 className="success-title">Welcome Back, {username || 'Nurse'}!</h2>
              <p className="success-subtitle">
                Loading the {authenticatedRole} dashboard.
              </p>

              <div className="success-details-box">
                <div className="detail-item">
                  <span className="detail-label">Station</span>
                  <span className="detail-value status-active">{authenticatedRole} • Active</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Security</span>
                  <span className="detail-value">Signed in</span>
                </div>
              </div>

              {onLoginSuccess ? (
                <button
                  type="button"
                  className="login-submit-btn"
                  style={{ marginTop: '8px' }}
                  onClick={() => onLoginSuccess(authenticatedRole)}
                >
                  Enter Dashboard Now →
                </button>
              ) : (
                <button
                  type="button"
                  className="login-submit-btn logout-btn"
                  onClick={handleLogout}
                >
                  Log Out / Switch Account
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {modalType === 'forgot' && <ForgotPasswordFlow onClose={() => setModalType(null)} />}
      {mfaData && (
        <MfaPromptModal
          mfaData={mfaData}
          onSuccess={(role, signedInUsername) => {
            setMfaData(null);
            setIsLoggedIn(true);
            setAuthenticatedRole(role);
            if (onLoginSuccess) {
              setTimeout(() => {
                onLoginSuccess(role, signedInUsername);
              }, 1400);
            }
          }}
          onCancel={() => setMfaData(null)}
        />
      )}
    </div>
  );
}
