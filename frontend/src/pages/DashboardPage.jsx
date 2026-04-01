import { Navigate } from 'react-router-dom';
import { SessionPanel } from '../components/SessionPanel';
import { WalletPanel } from '../components/WalletPanel';

export function DashboardPage({ session, clearSession, addLog, addToast }) {
  // Protect this route
  if (!session.sessionId) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <>
      <div className="hero" style={{ padding: '0 0.5rem 1rem' }}>
        <p className="eyebrow">Overview</p>
        <h1>My Wallet</h1>
        <p className="subhead">Manage your funds and recent transactions securely.</p>
      </div>

      <section className="grid two">
        <SessionPanel 
          session={session} 
          clearSession={clearSession} 
          addLog={addLog} 
          addToast={addToast} 
        />
        <div className="panel stack" style={{ justifyContent: 'center', alignItems: 'center' }}>
           <h2 style={{ color: 'var(--accent)', margin: 0 }}>Ready to Transact</h2>
           <p className="muted" style={{ textAlign: 'center' }}>Your account is fully secured. You can now send or receive funds instantly.</p>
        </div>
      </section>

      <WalletPanel 
        session={session} 
        addLog={addLog} 
        addToast={addToast} 
      />
    </>
  );
}
