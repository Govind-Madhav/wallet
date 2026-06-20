import { Navigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { SessionPanel } from '../components/SessionPanel';
import { WalletPanel } from '../components/WalletPanel';
import { RecentTransactionsPanel } from '../components/RecentTransactionsPanel';
import { BalanceCard } from '../components/BalanceCard';

export function DashboardPage({ session, clearSession, addLog, addToast }) {
  // Protect this route
  if (!session.sessionId) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <>
      {/* Welcome Banner */}
      <div className="welcome-banner">
        <p className="eyebrow">Dashboard</p>
        <h1>Welcome back{session.identifier ? `, ${session.identifier}` : ''}</h1>
        <p className="subhead">Manage your funds and recent transactions securely.</p>
      </div>

      <section className="dashboard-layout">
        <div className="dashboard-main stack">
          <RecentTransactionsPanel
            session={session}
            addLog={addLog}
            addToast={addToast}
            limit={5}
            showMoreLink
            moreLinkTo="/transactions"
            eyebrow="Activity"
            title="Recent Transactions"
            description="Review your latest wallet movements and open the full ledger when needed."
          />

          <WalletPanel
            session={session}
            addLog={addLog}
            addToast={addToast}
            showBalance={false}
          />
        </div>

        <aside className="dashboard-side stack">
          <BalanceCard session={session} addLog={addLog} addToast={addToast} />
          <SessionPanel
            session={session}
            clearSession={clearSession}
            addLog={addLog}
            addToast={addToast}
          />
        </aside>
      </section>
    </>
  );
}

DashboardPage.propTypes = {
  session: PropTypes.shape({
    sessionId: PropTypes.string,
    accessToken: PropTypes.string,
    identifier: PropTypes.string
  }).isRequired,
  clearSession: PropTypes.func.isRequired,
  addLog: PropTypes.func.isRequired,
  addToast: PropTypes.func.isRequired
};
