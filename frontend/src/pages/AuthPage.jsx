import { Navigate, useNavigate } from 'react-router-dom';
import { AuthPanel } from '../components/AuthPanel';

export function AuthPage({ updateTokens, addLog, addToast, session }) {
  const navigate = useNavigate();

  // Redirect to dashboard if logged in
  if (session.sessionId) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="auth-shell">
      <div className="auth-intro">
        <p className="eyebrow">DBT Wallet</p>
        <h1>Welcome Back</h1>
        <p className="subhead">Sign in to access your secure wallet console.</p>
      </div>

      <AuthPanel 
        updateTokens={(tokens) => {
          updateTokens(tokens);
          navigate('/', { replace: true });
        }} 
        addLog={addLog} 
        addToast={addToast} 
      />
    </div>
  );
}
