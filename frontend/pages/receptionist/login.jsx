import React, { useState, useEffect } from 'react';
import './login.css';
import doctorImg from '../images/doctor.png';
import slideClipboard from '../images/slide_clipboard.png';
import slideNurses from '../images/slide_nurses.png';
import slideXray from '../images/slide_xray.png';
import slideSurgery from '../images/slide_surgery.png';
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

function RecoveryEyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" width="18" height="18">
      <path d="M2.5 12s3.5-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.5 5.5-9.5 5.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function ForcedPasswordChangeModal({ username, tempPassword, onSuccess, onCancel }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!newPassword) {
      setError('Please enter a new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    if (newPassword === tempPassword) {
      setError('Your new password cannot be the same as the temporary password.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const result = await api('auth/force-change-password', {
        method: 'POST',
        body: JSON.stringify({
          username,
          currentPassword: tempPassword,
          newPassword,
          confirmPassword,
        }),
      });
      onSuccess(result);
    } catch (err) {
      setError(err.message || 'Unable to update password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="recovery-backdrop animate-fade-in" role="presentation" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onCancel();
    }}>
      <section className="recovery-panel animate-slide-up" role="dialog" aria-modal="true" aria-labelledby="force-password-title">
        <div className="recovery-topline">
          <span>MedVault Security</span>
          <span aria-hidden="true">🔒 Password Required</span>
        </div>
        <div className="recovery-content">
          <p className="recovery-kicker">Security Requirement</p>
          <h2 id="force-password-title">Set New Password</h2>
          <p className="recovery-subtitle">
            An administrator has reset your password. You must set a new permanent password for <strong>@{username}</strong> before accessing your dashboard.
          </p>
          <form onSubmit={handleSubmit}>
            <label className="recovery-label" htmlFor="force-new-password">New Password</label>
            <div className="recovery-input-wrap">
              <input
                id="force-new-password"
                type={showNewPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                autoFocus
                placeholder="Enter your new password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
              />
              <button
                type="button"
                className="recovery-eye"
                onClick={() => setShowNewPassword((v) => !v)}
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
              >
                <RecoveryEyeIcon />
              </button>
            </div>

            <label className="recovery-label" htmlFor="force-confirm-password">Confirm New Password</label>
            <div className="recovery-input-wrap">
              <input
                id="force-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="Confirm your new password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
              />
              <button
                type="button"
                className="recovery-eye"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={showConfirmPassword ? 'Hide confirmation' : 'Show confirmation'}
              >
                <RecoveryEyeIcon />
              </button>
            </div>

            {error && <p className="recovery-error" role="alert">{error}</p>}

            <button className="recovery-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Updating Password...' : 'Save New Password & Continue'}
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
  const [forcedResetData, setForcedResetData] = useState(null); // { username, tempPassword, role }
  const [shakeField, setShakeField] = useState(null);

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
      setShakeField('password');
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

      if (result.mustChangePassword) {
        setForcedResetData({ username: result.username || username, tempPassword: password, role: result.role });
        return;
      }

      setIsLoggedIn(true);
      setAuthenticatedRole(result.role);
      if (onLoginSuccess) {
        setTimeout(() => {
          onLoginSuccess(result.role, result.username, result);
        }, 1400);
      }
    } catch (error) {
      setIsSubmitting(false);
      setErrors({ username: '', password: '', general: error.message });
    }
  };

  const handleForcedPasswordSuccess = (result) => {
    setForcedResetData(null);
    setIsLoggedIn(true);
    setAuthenticatedRole(result.role);
    if (onLoginSuccess) {
      setTimeout(() => {
        onLoginSuccess(result.role, result.username, result);
      }, 1000);
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

      {forcedResetData && (
        <ForcedPasswordChangeModal
          username={forcedResetData.username}
          tempPassword={forcedResetData.tempPassword}
          onSuccess={handleForcedPasswordSuccess}
          onCancel={() => setForcedResetData(null)}
        />
      )}
    </div>
  );
}
