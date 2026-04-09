import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { walletApi } from '../api';

const formatAmount = (value) => {
  const amount = Number(value || 0);
  const prefix = amount > 0 ? '+' : '';
  return `${prefix}${amount.toFixed(2)}`;
};

const formatDate = (value) => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value || '-';
  }
};

const formatParty = (transaction) => {
  if (transaction?.counterpartyLabel) return transaction.counterpartyLabel;
  if (transaction?.counterpartyEmail) return transaction.counterpartyEmail;
  if (transaction?.counterpartyAccountId) return transaction.counterpartyAccountId;
  return '-';
};

export function RecentTransactionsPanel({ session, addToast, addLog }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  let content = null;

  if (loading) {
    content = <p className="muted">Loading recent transactions...</p>;
  } else if (transactions.length === 0) {
    content = (
      <div className="session-info" style={{ textAlign: 'left' }}>
        No transactions yet.
      </div>
    );
  } else {
    content = (
      <div className="stack recent-transactions-list">
        {transactions.map((transaction) => (
          <div
            key={`${transaction.id}-${transaction.reference_id}`}
            className="session-info"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.35rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
              <strong>{transaction.transaction_type}</strong>
              <span style={{ fontWeight: 700 }}>
                {formatAmount(transaction.amount)}
              </span>
            </div>
            {(transaction.directionLabel || transaction.counterpartyLabel || transaction.counterpartyEmail || transaction.counterpartyAccountId) && (
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                {transaction.directionLabel ? `${transaction.directionLabel} ${formatParty(transaction)}` : `Party: ${formatParty(transaction)}`}
              </div>
            )}
            <div className="muted" style={{ fontSize: '0.85rem' }}>
              Ref: {transaction.reference_id || '-'}
            </div>
            <div className="muted" style={{ fontSize: '0.85rem' }}>
              {formatDate(transaction.created_at)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const loadTransactions = useCallback(async () => {
    if (!session?.sessionId || !session?.accessToken) {
      setTransactions([]);
      return;
    }

    setLoading(true);
    try {
      const response = await walletApi.getRecentTransactions(session, 5);
      setTransactions(Array.isArray(response.transactions) ? response.transactions : []);
      addLog('TRANSACTIONS_FETCHED', `Loaded ${response.transactions?.length || 0} recent transactions`);
    } catch (error) {
      addToast('Recent Transactions Failed', error.message, 'error');
      addLog('TRANSACTIONS_FAILED', error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [session?.sessionId, session?.accessToken, addLog, addToast]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    const handleTransactionsUpdated = () => {
      void loadTransactions();
    };

    window.addEventListener('wallet-transactions-updated', handleTransactionsUpdated);
    return () => window.removeEventListener('wallet-transactions-updated', handleTransactionsUpdated);
  }, [loadTransactions]);

  return (
    <div className="panel stack recent-transactions-panel">
      <div>
        <p className="eyebrow">Activity</p>
        <h2 style={{ marginBottom: '0.25rem' }}>Recent Transactions</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Latest ledger entries from your wallet.
        </p>
      </div>

      <div className="recent-transactions-body">
        {content}
      </div>
    </div>
  );
}

RecentTransactionsPanel.propTypes = {
  session: PropTypes.shape({
    sessionId: PropTypes.string,
    accessToken: PropTypes.string
  }).isRequired,
  addToast: PropTypes.func.isRequired,
  addLog: PropTypes.func.isRequired
};
