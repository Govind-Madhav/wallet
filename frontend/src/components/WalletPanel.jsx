// frontend/src/components/WalletPanel.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { walletApi } from '../api';

export function WalletPanel({ session, addLog, addToast }) {
  const [balance, setBalance] = useState('0.00');
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

  useEffect(() => {
    if (!session?.sessionId || !session?.accessToken) {
      return;
    }

    const timer = setTimeout(() => {
      void handleFetchBalance();
    }, 0);

    return () => clearTimeout(timer);
  }, [session?.sessionId, session?.accessToken, handleFetchBalance]);

  const handleTransaction = async (e, type) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const body = Object.fromEntries(formData.entries());
    body.amount = Number(body.amount);
    body.referenceId = `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    try {
      const res = await walletApi[type](body, session);
      addToast('Success', `${type.toUpperCase()} completed`, 'success');
      addLog(`${type.toUpperCase()}_SUCCESS`, JSON.stringify(res, null, 2));
      e.target.reset();
      window.dispatchEvent(new CustomEvent('wallet-transactions-updated'));
      await handleFetchBalance();
    } catch (err) {
      addToast(`${type} Failed`, err.message, 'error');
      addLog(`${type.toUpperCase()}_FAILED`, err.message, 'error');
    }
  };

  return (
    <>
      <div className="panel grid two">
        <div className="stack">
          <h2>Current Balance</h2>
          <div className="metric">{Number(balance).toFixed(2)}</div>
        </div>
        
        <div className="stack">
          <h2>Deposit</h2>
          <form className="stack" onSubmit={(e) => handleTransaction(e, 'deposit')}>
            <input name="amount" type="number" min="0.01" step="0.01" placeholder="Amount" required />
            <button className="btn">Add Funds</button>
          </form>
        </div>
      </div>

      <div className="panel grid two">
        <div className="stack">
          <h2>Withdraw</h2>
          <form className="stack" onSubmit={(e) => handleTransaction(e, 'withdraw')}>
            <input name="amount" type="number" min="0.01" step="0.01" placeholder="Amount" required />
            <button className="btn ghost">Withdraw Funds</button>
          </form>
        </div>

        <div className="stack">
          <h2>Transfer</h2>
          <form className="stack" onSubmit={(e) => handleTransaction(e, 'transfer')}>
            <input name="toEmail" type="email" placeholder="Recipient Email" required />
            <input name="amount" type="number" min="0.01" step="0.01" placeholder="Amount" required />
            <button className="btn ghost">Send Transfer</button>
          </form>
        </div>
      </div>
    </>
  );
}

WalletPanel.propTypes = {
  session: PropTypes.shape({
    sessionId: PropTypes.string,
    accessToken: PropTypes.string
  }).isRequired,
  addLog: PropTypes.func.isRequired,
  addToast: PropTypes.func.isRequired
};
