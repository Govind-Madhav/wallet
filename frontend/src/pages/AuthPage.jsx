import { Navigate, useNavigate } from 'react-router-dom';
import { AuthPanel } from '../components/AuthPanel';

export function AuthPage({ updateTokens, addLog, addToast, session }) {
  const navigate = useNavigate();

  // Redirect to dashboard if logged in
  if (session.sessionId) {
    return <Navigate to="/" replace />;
  }

  return (
    <div style={{ maxWidth: '450px', margin: '4rem auto 0' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <p className="eyebrow" style={{ color: 'var(--accent)', fontWeight: 'bold' }}>DBT Wallet</p>
        <h1 style={{ margin: '0.5rem 0', fontSize: '2rem' }}>Welcome Back</h1>
        <p className="subhead" style={{ color: 'var(--muted)' }}>Enter your credentials to access your console.</p>
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
