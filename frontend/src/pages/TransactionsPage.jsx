import { Navigate, Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { ArrowLeftRight } from 'lucide-react';
import { RecentTransactionsPanel } from '../components/RecentTransactionsPanel';

export function TransactionsPage({ session, addLog, addToast }) {
  if (!session?.sessionId) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <section className="page-stack">
      <div className="page-hero">
        <div>
          <p className="eyebrow">Transactions</p>
          <h1>Full Transaction History</h1>
          <p className="subhead">Review deposits, withdrawals, and transfers in one place.</p>
        </div>
        <Link to="/" className="btn ghost">
          <ArrowLeftRight size={16} />
          Back to Dashboard
        </Link>
      </div>

      <RecentTransactionsPanel
        session={session}
        addLog={addLog}
        addToast={addToast}
        limit={200}
        eyebrow="Ledger"
        title="Transaction Ledger"
        description="The latest entries across your wallet history."
      />
    </section>
  );
}

TransactionsPage.propTypes = {
  session: PropTypes.shape({
    sessionId: PropTypes.string,
    accessToken: PropTypes.string
  }).isRequired,
  addLog: PropTypes.func.isRequired,
  addToast: PropTypes.func.isRequired
};