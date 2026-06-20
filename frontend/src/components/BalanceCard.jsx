import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Wallet2, RefreshCw } from 'lucide-react';
import { walletApi } from '../api';

export function BalanceCard({ session, addLog, addToast }) {
  const [balance, setBalance] = useState('0.00');
  const [loading, setLoading] = useState(false);

  const loadBalance = useCallback(async () => {
    if (!session?.sessionId || !session?.accessToken) {
      return;
    }

    setLoading(true);
    try {
      const response = await walletApi.getBalance(session);
      setBalance(response.balance);
      addLog('BALANCE_SUMMARY_LOADED', `Balance: ${response.balance}`);
    } catch (error) {
      addToast('Balance Failed', error.message, 'error');
      addLog('BALANCE_SUMMARY_FAILED', error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [session, addLog, addToast]);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  return (
    <section className="panel balance-summary-card stack">
      <div className="balance-summary-head">
        <div className="balance-summary-icon" aria-hidden="true">
          <Wallet2 size={18} />
        </div>
        <div>
          <p className="eyebrow">Wallet</p>
          <h2 style={{ marginBottom: 0 }}>Available Balance</h2>
        </div>
        <button type="button" className="btn ghost btn-mini balance-refresh-btn" onClick={() => void loadBalance()}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="balance-summary-value">{Number(balance).toFixed(2)}</div>
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Live ledger balance from your wallet account.
      </p>
    </section>
  );
}

BalanceCard.propTypes = {
  session: PropTypes.shape({
    sessionId: PropTypes.string,
    accessToken: PropTypes.string
  }).isRequired,
  addLog: PropTypes.func.isRequired,
  addToast: PropTypes.func.isRequired
};