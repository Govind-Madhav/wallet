import { Navigate } from 'react-router-dom';
import { SessionPanel } from '../components/SessionPanel';
import { WalletPanel } from '../components/WalletPanel';
import { RecentTransactionsPanel } from '../components/RecentTransactionsPanel';

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
        <RecentTransactionsPanel session={session} addLog={addLog} addToast={addToast} />
      </section>

      <WalletPanel 
        session={session} 
        addLog={addLog} 
        addToast={addToast} 
      />
    </>
  );
}
