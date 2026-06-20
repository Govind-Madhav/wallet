import { useState } from 'react';
import PropTypes from 'prop-types';
import { Mail, Lock, User, KeyRound, Phone, Building, AtSign } from 'lucide-react';
import { authApi } from '../api';

function OTPInput({ length = 6, onComplete }) {
  const [code, setCode] = useState('');
  
  return (
    <div className="otp-shell">
      <input 
        className="otp-input"
        type="text" 
        value={code}
        onChange={(e) => {
          const val = e.target.value.replaceAll(/\D/g, '').slice(0, length);
          setCode(val);
        }}
        placeholder="------"
        maxLength={length}
        autoComplete="one-time-code"
      />
      <button 
        type="button" 
        className="btn otp-cta"
        onClick={() => code.length === length && onComplete(code)}
        disabled={code.length !== length}
      >
        <KeyRound size={16} />
        Verify Code
      </button>
    </div>
  );
}

const TABS = [
  { key: 'login', label: 'Sign In' },
  { key: 'register', label: 'Register' },
  { key: 'recover', label: 'Recover' }
];

export function AuthPanel({ updateTokens, addLog, addToast }) {
  const [activeTab, setActiveTab] = useState('login');
  const [registerStep, setRegisterStep] = useState(1);
  const [registrationEmail, setRegistrationEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');

  const handleAuth = async (e, type) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const body = Object.fromEntries(formData.entries());

    try {
      if (type === 'login') {
        const res = await authApi.login(body);
        if (res.accessToken) {
          updateTokens({
            accessToken: res.accessToken,
            refreshToken: res.refreshToken,
            sessionId: res.sessionId,
            userId: res.userId,
            identifier: body.identifier || body.email
          });
          addToast('Success', 'Successfully logged in!', 'success');
        }
        addLog('LOGIN_SUCCESS', res);
      } else if (type === 'register') {
        const payload = {
          identifier: body.identifier,
          email: body.email,
          password: body.password,
          metadata: {
            phone: body.phone,
            bankName: body.bankName,
            upiId: body.upiId
          }
        };

        const res = await authApi.register(payload);
        addToast('Success', res.message || 'Registration successful. Please verify your email.', 'success');
        addLog('REGISTER_SUCCESS', res);
        
        // Advance to Stepper Step 2
        setRegistrationEmail(body.email);
        setRegisterStep(2);
      } else {
        const res = await authApi[type](body);
        if (type === 'forgotPassword' && res.devRecoveryOtp) {
          setResetToken(res.devRecoveryOtp);
          addToast('Recovery OTP', `Use OTP ${res.devRecoveryOtp} to reset your password.`, 'info');
        } else {
          addToast('Success', res.message, 'success');
        }
        addLog(`${type.toUpperCase()}_SUCCESS`, res);
        if (type === 'resetPassword') {
          setActiveTab('login');
        }
      }
      if (e.target.reset) e.target.reset();
    } catch (err) {
      addToast('Error', err.message, 'error');
      addLog(`${type.toUpperCase()}_FAILED`, err.message, 'error');
    }
  };

  const handleVerifyOTP = async (code) => {
    try {
      const res = await authApi.verifyEmail({ token: code });
      addToast('Success', 'Email verified successfully! You can now log in.', 'success');
      addLog('VERIFY_SUCCESS', res);
      setRegisterStep(1);
      setActiveTab('login');
    } catch (err) {
      addToast('Error', err.message, 'error');
      addLog('VERIFY_FAILED', err.message, 'error');
    }
  };

  const handleResendOTP = async () => {
    try {
      const res = await authApi.resendVerification({ email: registrationEmail });
      addToast('Success', 'A new verification code has been sent.', 'info');
      addLog('RESEND_SUCCESS', res);
    } catch (err) {
      addToast('Error', err.message, 'error');
    }
  };

  const handleResetPassword = async () => {
    if (!resetToken || !resetNewPassword) {
      addToast('Error', 'Token and new password required', 'error');
      return;
    }

    if (!/^\d{6}$/.test(resetToken)) {
      addToast('Error', 'Enter a valid 6-digit recovery OTP', 'error');
      return;
    }

    try {
      const res = await authApi.resetPassword({ token: resetToken, newPassword: resetNewPassword });
      addToast('Success', res.message || 'Password reset successful', 'success');
      addLog('RESETPASSWORD_SUCCESS', res);
      setResetToken('');
      setResetNewPassword('');
      setActiveTab('login');
    } catch (err) {
      addToast('Error', err.message, 'error');
      addLog('RESETPASSWORD_FAILED', err.message, 'error');
    }
  };

  const renderForm = () => {
    switch(activeTab) {
      case 'login':
        return (
          <form className="stack" onSubmit={(e) => handleAuth(e, 'login')}>
            <div className="input-group">
              <Mail size={16} className="input-icon" />
              <input name="identifier" placeholder="Email or Username" required />
            </div>
            <div className="input-group">
              <Lock size={16} className="input-icon" />
              <input name="password" type="password" placeholder="Password" required />
            </div>
            <button className="btn">Sign In</button>
            <div className="button-row center">
              <button type="button" className="auth-link-btn" onClick={() => setActiveTab('recover')}>
                Forgot password?
              </button>
            </div>
          </form>
        );
      case 'register':
        if (registerStep === 1) {
          return (
            <form className="stack" onSubmit={(e) => handleAuth(e, 'register')}>
              <div className="input-group">
                <User size={16} className="input-icon" />
                <input name="identifier" placeholder="Memorable Username (required)" required />
              </div>
              <div className="input-group">
                <Mail size={16} className="input-icon" />
                <input name="email" type="email" placeholder="Email address" required />
              </div>
              <div className="input-group">
                <Phone size={16} className="input-icon" />
                <input name="phone" type="tel" placeholder="Phone Number" required />
              </div>
              <div className="input-group" style={{ position: 'relative' }}>
                <Building size={16} className="input-icon" />
                <select name="bankName" required defaultValue="" style={{ paddingLeft: '2.5rem', appearance: 'none', color: 'var(--text-secondary)' }}>
                  <option value="" disabled>Select Bank for Linkage (Demo)</option>
                  <option value="ABC Bank">ABC Bank</option>
                  <option value="XYZ Bank">XYZ Bank</option>
                </select>
              </div>
              <div className="input-group">
                <AtSign size={16} className="input-icon" />
                <input name="upiId" type="text" placeholder="UPI ID (e.g. user@abcbank)" required />
              </div>
              <div className="input-group">
                <Lock size={16} className="input-icon" />
                <input name="password" type="password" placeholder="Password (min 8 chars)" required minLength="8" />
              </div>
              <button className="btn">Create Account</button>
            </form>
          );
        } else {
          // STEP 2: Verify OTP
          return (
            <div className="stack auth-verify-step">
              <h3 className="auth-verify-title">Verify Your Email</h3>
              <p className="muted auth-verify-subhead">We sent a 6-digit code to <strong>{registrationEmail}</strong></p>
              
              <OTPInput length={6} onComplete={handleVerifyOTP} />
              
              <button type="button" className="btn ghost" onClick={handleResendOTP}>
                Code expired? Resend Code
              </button>
            </div>
          );
        }
      case 'recover':
        return (
          <form className="stack" onSubmit={(e) => handleAuth(e, 'forgotPassword')}>
            <div className="input-group">
              <Mail size={16} className="input-icon" />
              <input name="email" type="email" placeholder="Account Email" required />
            </div>
            <button className="btn">Send Reset Link</button>
            
            <h3 className="auth-mini-title">Have a recovery code?</h3>
            <div className="stack auth-reset-block">
              <div className="input-group">
                <KeyRound size={16} className="input-icon" />
                <input
                  name="token"
                  placeholder="6-digit Recovery OTP"
                  value={resetToken}
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  onChange={(event) => setResetToken(event.target.value.replaceAll(/\D/g, '').slice(0, 6))}
                />
              </div>
              <div className="input-group">
                <Lock size={16} className="input-icon" />
                <input
                  name="newPassword"
                  type="password"
                  placeholder="New Password"
                  value={resetNewPassword}
                  onChange={(event) => setResetNewPassword(event.target.value)}
                />
              </div>
              <button type="button" className="btn ghost" onClick={handleResetPassword}>Reset Password</button>
            </div>
          </form>
        );
    }
  };

  return (
    <div className="panel">
      {/* Pill Tab Switcher */}
      <div className="auth-tabs">
        {TABS.map(tab => (
          <button 
            key={tab.key}
            className={`auth-tab ${activeTab === tab.key ? 'active' : ''}`} 
            onClick={() => {
              setActiveTab(tab.key);
              if (tab.key === 'register') setRegisterStep(1);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* Dynamic Content */}
      <div className="auth-panel-body">
        {renderForm()}
      </div>
    </div>
  );
}

OTPInput.propTypes = {
  length: PropTypes.number,
  onComplete: PropTypes.func.isRequired
};

AuthPanel.propTypes = {
  updateTokens: PropTypes.func.isRequired,
  addLog: PropTypes.func.isRequired,
  addToast: PropTypes.func.isRequired
};
