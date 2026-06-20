import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
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

const formatAccountShortId = (value, fallback = '000000') => {
  if (!value) return fallback;

  const raw = String(value);
  const digitsOnly = raw.replaceAll(/\D/g, '');
  if (digitsOnly) {
    return String(Number(digitsOnly.slice(-6))).padStart(6, '0');
  }

  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + (raw.codePointAt(i) || 0)) >>> 0;
  }

  return String(hash % 1000000).padStart(6, '0');
};

const formatParty = (transaction) => {
  if (transaction?.counterpartyAccountId) return `#${formatAccountShortId(transaction.counterpartyAccountId)}`;
  if (transaction?.counterpartyLabel) return transaction.counterpartyLabel;
  if (transaction?.counterpartyEmail) return transaction.counterpartyEmail;
  return '-';
};

const getTypeClass = (type) => {
  if (!type) return '';
  const t = type.toUpperCase();
  if (t.includes('DEPOSIT')) return 'deposit';
  if (t.includes('WITHDRAW')) return 'withdraw';
  if (t.includes('TRANSFER')) return 'transfer';
  return '';
};

const FILTERS = ['All', 'Deposit', 'Withdraw', 'Transfer'];

export function RecentTransactionsPanel({
  session,
  addToast,
  addLog,
  limit = 10,
  title = 'Recent Transactions',
  eyebrow = 'Transactions',
  description = 'Latest ledger entries from your wallet.',
  showMoreLink = false,
  moreLinkTo = '/transactions',
  moreLinkLabel = 'More'
}) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');

  const loadTransactions = useCallback(async () => {
    if (!session?.sessionId || !session?.accessToken) {
      setTransactions([]);
      return;
    }

    setLoading(true);
    try {
      const response = await walletApi.getRecentTransactions(session, limit);
      setTransactions(Array.isArray(response.transactions) ? response.transactions : []);
      addLog('TRANSACTIONS_FETCHED', `Loaded ${response.transactions?.length || 0} recent transactions`);
    } catch (error) {
      addToast('Recent Transactions Failed', error.message, 'error');
      addLog('TRANSACTIONS_FAILED', error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [session, limit, addLog, addToast]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    const handleTransactionsUpdated = () => {
      void loadTransactions();
    };

    globalThis.addEventListener('wallet-transactions-updated', handleTransactionsUpdated);
    return () => globalThis.removeEventListener('wallet-transactions-updated', handleTransactionsUpdated);
  }, [loadTransactions]);

  const filteredTransactions = activeFilter === 'All' 
    ? transactions 
    : transactions.filter(tx => {
        const type = (tx.transaction_type || '').toUpperCase();
        return type.includes(activeFilter.toUpperCase());
      });

  let content = null;

  if (loading) {
    content = (
      <div className="stack tight">
        <div className="skeleton" style={{ height: '60px' }} />
        <div className="skeleton" style={{ height: '60px' }} />
        <div className="skeleton" style={{ height: '60px' }} />
      </div>
    );
  } else if (filteredTransactions.length === 0) {
    content = (
      <div className="tx-empty">
        No transactions found.
      </div>
    );
  } else {
    content = (
      <div className="recent-transactions-list">
        {filteredTransactions.map((transaction) => {
          const typeClass = getTypeClass(transaction.transaction_type);
          const amount = Number(transaction.amount || 0);
          
          return (
            <div
              key={`${transaction.id}-${transaction.reference_id}`}
              className="tx-row"
            >
              <div className={`tx-type-dot ${typeClass}`} />
              <div className="tx-details">
                <div className="tx-row-top">
                  <strong style={{ fontSize: '0.85rem' }}>{transaction.transaction_type}</strong>
                  <span className={`tx-amount ${amount >= 0 ? 'positive' : 'negative'}`}>
                    {formatAmount(transaction.amount)}
                  </span>
                </div>
                {(transaction.directionLabel || transaction.counterpartyLabel || transaction.counterpartyEmail || transaction.counterpartyAccountId) && (
                  <div className="tx-note">
                    {transaction.directionLabel ? `${transaction.directionLabel} ${formatParty(transaction)}` : `Party: ${formatParty(transaction)}`}
                  </div>
                )}
                <div className="tx-note">
                  ID: {transaction.reference_id || '-'}
                </div>
                <div className="tx-note">
                  {formatDate(transaction.created_at)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="panel stack recent-transactions-panel">
      <div className="panel-heading-row">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 style={{ marginBottom: '0.25rem' }}>{title}</h2>
          <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 0 }}>
            {description}
          </p>
        </div>
        {showMoreLink && (
          <Link to={moreLinkTo} className="btn ghost btn-mini">
            {moreLinkLabel}
          </Link>
        )}
      </div>

      <div className="tx-filter-pills">
        {FILTERS.map(filter => (
          <button
            key={filter}
            className={`tx-pill ${activeFilter === filter ? 'active' : ''}`}
            onClick={() => setActiveFilter(filter)}
          >
            {filter}
          </button>
        ))}
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
  limit: PropTypes.number,
  title: PropTypes.string,
  eyebrow: PropTypes.string,
  description: PropTypes.string,
  showMoreLink: PropTypes.bool,
  moreLinkTo: PropTypes.string,
  moreLinkLabel: PropTypes.string,
  addToast: PropTypes.func.isRequired,
  addLog: PropTypes.func.isRequired
};
