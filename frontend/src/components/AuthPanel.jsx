// frontend/src/components/AuthPanel.jsx
import { useState } from 'react';
import { authApi } from '../api';

function OTPInput({ length = 6, onComplete }) {
  const [code, setCode] = useState('');
  
  return (
    <div style={{ margin: '1.5rem 0', textAlign: 'center' }}>
      <input 
        type="text" 
        value={code}
        onChange={(e) => {
          const val = e.target.value.replace(/\D/g, '').slice(0, length);
          setCode(val);
        }}
        placeholder="------"
        style={{
          letterSpacing: '0.75rem',
          fontSize: '2rem',
          textAlign: 'center',
          fontFamily: 'monospace',
          fontWeight: 'bold',
          padding: '1rem'
        }}
      />
      <button 
        type="button" 
        className="btn" 
        style={{ marginTop: '1rem' }} 
        onClick={() => code.length === length && onComplete(code)}
        disabled={code.length !== length}
      >
        Verify Code
      </button>
    </div>
  );
}

export function AuthPanel({ updateTokens, addLog, addToast }) {
  const [activeTab, setActiveTab] = useState('login'); // login, register, recover
  const [registerStep, setRegisterStep] = useState(1); // 1 = Form, 2 = Verify OTP
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
            identifier: body.identifier || body.email
          });
          addToast('Success', 'Successfully logged in!', 'success');
        }
        addLog('LOGIN_SUCCESS', res);
      } else if (type === 'register') {
        const res = await authApi.register(body);
        addToast('Success', res.message || 'Registration successful. Please verify your email.', 'success');
        addLog('REGISTER_SUCCESS', res);
        
        // Advance to Stepper Step 2
        setRegistrationEmail(body.email);
        setRegisterStep(2);
      } else {
        const res = await authApi[type](body);
        addToast('Success', res.message, 'success');
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
            <input name="identifier" placeholder="Email or Username" required />
            <input name="password" type="password" placeholder="Password" required />
            <button className="btn">Sign In</button>
            <div className="button-row" style={{ marginTop: '0.5rem', justifyContent: 'center' }}>
              <button type="button" className="btn ghost" style={{ border: 'none' }} onClick={() => setActiveTab('recover')}>Forgot password?</button>
            </div>
          </form>
        );
      case 'register':
        if (registerStep === 1) {
          return (
            <form className="stack" onSubmit={(e) => handleAuth(e, 'register')}>
              <input name="identifier" placeholder="Username (optional)" />
              <input name="email" type="email" placeholder="Email address" required />
              <input name="password" type="password" placeholder="Password (min 8 chars)" required minLength="8" />
              <button className="btn">Create Account</button>
            </form>
          );
        } else {
          // STEP 2: Verify OTP
          return (
            <div className="stack" style={{ textAlign: 'center' }}>
              <h3 style={{ margin: '0' }}>Verify Your Email</h3>
              <p className="muted" style={{ margin: '0.5rem 0 0' }}>We sent a 6-digit code to <strong>{registrationEmail}</strong></p>
              
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
            <input name="email" type="email" placeholder="Account Email" required />
            <button className="btn">Send Reset Link</button>
            
            <h3 style={{ margin: '1rem 0 0.5rem', fontSize: '1rem' }}>Have a recovery code?</h3>
            <div className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
              <input
                name="token"
                placeholder="Recovery Code"
                value={resetToken}
                onChange={(event) => setResetToken(event.target.value)}
              />
              <input
                name="newPassword"
                type="password"
                placeholder="New Password"
                value={resetNewPassword}
                onChange={(event) => setResetNewPassword(event.target.value)}
              />
              <button type="button" className="btn ghost" onClick={handleResetPassword}>Reset Password</button>
            </div>
          </form>
        );
    }
  };

  return (
    <div className="panel">
      {/* Header Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--line)' }}>
        {['login', 'register', 'recover'].map(tab => (
          <button 
            key={tab}
            className={`btn ghost ${activeTab === tab ? '' : 'muted'}`} 
            style={{ 
              border: 'none', 
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              borderRadius: '0',
              padding: '0.5rem',
              color: activeTab === tab ? 'var(--accent)' : 'var(--muted)',
              background: 'transparent'
            }}
            onClick={() => {
              setActiveTab(tab);
              if (tab === 'register') setRegisterStep(1); // Reset stepper if switching back
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
      
      {/* Dynamic Content */}
      <div style={{ minHeight: '260px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {renderForm()}
      </div>
    </div>
  );
}
