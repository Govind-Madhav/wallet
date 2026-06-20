// frontend/src/components/WalletPanel.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Clock } from 'lucide-react';
import { walletApi } from '../api';

const ACTIONS = [
  { key: 'deposit', label: 'Deposit', icon: ArrowDownLeft, colorClass: 'deposit' },
  { key: 'withdraw', label: 'Withdraw', icon: ArrowUpRight, colorClass: 'withdraw' },
  { key: 'transfer', label: 'Transfer', icon: ArrowLeftRight, colorClass: 'transfer' }
];

const TRANSACTION_ID_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const generateTransactionId = () => {
  const randomValues = new Uint8Array(6);
  globalThis.crypto.getRandomValues(randomValues);

  return Array.from(randomValues, (value) => TRANSACTION_ID_CHARSET[value % TRANSACTION_ID_CHARSET.length]).join('');
};

export function WalletPanel({ session, addLog, addToast, showBalance = true }) {
  const [balance, setBalance] = useState('0.00');
  const [activeAction, setActiveAction] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const lastErrorToastAtRef = useRef(0);
  const TOAST_COOLDOWN_MS = 2500;

  const handleFetchBalance = useCallback(async () => {
    try {
      const res = await walletApi.getBalance(session);
      setBalance(res.balance);
      addLog('BALANCE_FETCHED', `Balance: ${res.balance}`);
    } catch (err) {
      const now = Date.now();
      if (now - lastErrorToastAtRef.current > TOAST_COOLDOWN_MS) {
        addToast('Fetch Failed', err.message, 'error');
        lastErrorToastAtRef.current = now;
      }
      addLog('BALANCE_FAILED', err.message, 'error');
    }
  }, [session, addLog, addToast]);

  const fetchWithdrawals = useCallback(async () => {
    try {
      const res = await walletApi.getWithdrawals(session, 5);
      setWithdrawals(Array.isArray(res.withdrawals) ? res.withdrawals : []);
    } catch {
      // Silently fail — not critical
    }
  }, [session]);

  useEffect(() => {
    if (!session?.sessionId || !session?.accessToken) {
      return;
    }

    const timer = setTimeout(() => {
      void handleFetchBalance();
      void fetchWithdrawals();
    }, 0);

    return () => clearTimeout(timer);
  }, [session?.sessionId, session?.accessToken, handleFetchBalance, fetchWithdrawals]);

  const handleTransaction = async (e, type) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const body = Object.fromEntries(formData.entries());
    body.amount = Number(body.amount);
    body.referenceId = generateTransactionId();

    if (type === 'withdraw') {
      body.idempotencyKey = `WD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      body.method = 'UPI';
      body.accountDetails = { channel: 'default-upi' };
    }

    try {
      const res = await walletApi[type](body, session);
      const withdrawalStatus = type === 'withdraw' ? res?.result?.withdrawal?.status : null;
      const successMessage = type === 'withdraw' && withdrawalStatus
        ? `Withdrawal request ${withdrawalStatus}`
        : `${type.toUpperCase()} completed`;
      addLog(`${type.toUpperCase()}_SUCCESS`, JSON.stringify(res, null, 2));

      addToast('Success', successMessage, 'success');
      e.target.reset();
      setActiveAction(null);
      globalThis.dispatchEvent(new CustomEvent('wallet-transactions-updated'));
      await handleFetchBalance();
      await fetchWithdrawals();
    } catch (err) {
      addToast(`${type} Failed`, err.message, 'error');
      addLog(`${type.toUpperCase()}_FAILED`, err.message, 'error');
    }
  };

  const getStatusPillClass = (status) => {
    if (!status) return 'status-pill neutral';
    const s = status.toUpperCase();
    if (s.includes('SUCCESS') || s.includes('COMPLETED')) return 'status-pill success';
    if (s.includes('REJECT') || s.includes('FAILED')) return 'status-pill danger';
    if (s.includes('PENDING') || s.includes('PROCESSING')) return 'status-pill pending';
    return 'status-pill neutral';
  };

  const pendingWithdrawals = withdrawals.filter(w => 
    w.status && !['SUCCESS', 'COMPLETED', 'REJECTED', 'FAILED'].includes(w.status.toUpperCase())
  );

  return (
    <>
      {/* Hero Balance Card */}
      {showBalance && (
        <div className="panel balance-hero">
          <div className="balance-label">Available Balance</div>
          <div className="balance-amount">
            {Number(balance).toFixed(2)}
          </div>
        </div>
      )}

      {/* Quick Action Cards */}
      <div className="action-cards">
        {ACTIONS.map(action => {
          const Icon = action.icon;
          return (
            <button 
              key={action.key}
              type="button"
              className={`action-card ${activeAction === action.key ? 'active' : ''}`}
              onClick={() => setActiveAction(activeAction === action.key ? null : action.key)}
            >
              <div className={`action-card-icon ${action.colorClass}`}>
                <Icon size={22} />
              </div>
              <div className="action-card-title">{action.label}</div>
            </button>
          );
        })}
      </div>

      {/* Expandable Action Form */}
      {activeAction && (
        <div className="panel action-form-container">
          {activeAction === 'deposit' && (
            <form className="stack" onSubmit={(e) => handleTransaction(e, 'deposit')}>
              <h3>Deposit Funds</h3>
              <input name="amount" type="number" min="0.01" step="0.01" placeholder="Enter amount" required />
              <button className="btn">
                <ArrowDownLeft size={16} /> Add Funds
              </button>
            </form>
          )}
          {activeAction === 'withdraw' && (
            <div className="stack">
              <form className="stack" onSubmit={(e) => handleTransaction(e, 'withdraw')}>
                <h3>Withdraw Funds</h3>
                <input name="amount" type="number" min="0.01" step="0.01" placeholder="Enter amount" required />
                <button className="btn ghost">
                  <ArrowUpRight size={16} /> Withdraw Funds
                </button>
              </form>
            </div>
          )}
          {activeAction === 'transfer' && (
            <form className="stack" onSubmit={(e) => handleTransaction(e, 'transfer')}>
              <h3>Transfer Funds</h3>
              <input name="toEmail" type="email" placeholder="Recipient Email" required />
              <input name="amount" type="number" min="0.01" step="0.01" placeholder="Enter amount" required />
              <button className="btn ghost">
                <ArrowLeftRight size={16} /> Send Transfer
              </button>
            </form>
          )}
        </div>
      )}

      {/* Pending Withdrawal Tracker */}
      {pendingWithdrawals.length > 0 && (
        <div className="panel withdrawal-tracker">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Clock size={18} />
            Pending Withdrawals
          </h3>
          {pendingWithdrawals.map(w => (
            <div key={w.id} className="withdrawal-item">
              <div>
                <strong style={{ fontSize: '0.9rem' }}>{Number(w.amount || 0).toFixed(2)}</strong>
                <div className="muted" style={{ fontSize: '0.75rem' }}>
                  {w.createdAt ? new Date(w.createdAt).toLocaleString() : ''}
                </div>
              </div>
              <span className={getStatusPillClass(w.status)}>
                {w.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

WalletPanel.propTypes = {
  session: PropTypes.shape({
    sessionId: PropTypes.string,
    accessToken: PropTypes.string
  }).isRequired,
  showBalance: PropTypes.bool,
  addLog: PropTypes.func.isRequired,
  addToast: PropTypes.func.isRequired
};
