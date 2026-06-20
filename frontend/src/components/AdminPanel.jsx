import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { adminApi } from '../api';

const formatCurrency = (value) => Number(value || 0).toFixed(2);

const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

const toSixDigits = (index) => String(index + 1).padStart(6, '0');

const toAccountId = (value) => {
  const raw = String(value || '');
  return raw.startsWith('user_') ? raw.slice(5) : raw;
};

const roleBadgeClass = (roles = []) => (roles.includes('admin') ? 'role-badge admin' : 'role-badge');

export function AdminPanel({ session, addLog, addToast }) {
  const [state, setState] = useState({
    loading: true,
    authorized: true,
    overview: null,
    users: [],
    accounts: [],
    ledger: [],
    sessions: [],
    withdrawals: [],
    adminLogs: []
  });

  const [actionLoading, setActionLoading] = useState({});

  const loadAdminData = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const [overview, usersRes, accountsRes, ledgerRes, sessionsRes, withdrawalsRes, logsRes] = await Promise.all([
        adminApi.getOverview(session),
        adminApi.getUsers(session, { limit: 10 }),
        adminApi.getAccounts(session, { limit: 10 }),
        adminApi.getLedger(session, { limit: 12 }),
        adminApi.getSessions(session, { limit: 10 }),
        adminApi.getWithdrawals(session, { limit: 12 }),
        adminApi.getAdminLogs(session, { limit: 12 })
      ]);

      setState({
        loading: false,
        authorized: true,
        overview,
        users: usersRes.users || [],
        accounts: accountsRes.accounts || [],
        ledger: ledgerRes.ledger || [],
        sessions: sessionsRes.sessions || [],
        withdrawals: withdrawalsRes.withdrawals || [],
        adminLogs: logsRes.logs || []
      });

      addLog('ADMIN_PANEL_LOADED', {
        users: usersRes.users?.length || 0,
        accounts: accountsRes.accounts?.length || 0,
        ledger: ledgerRes.ledger?.length || 0,
        withdrawals: withdrawalsRes.withdrawals?.length || 0
      });
    } catch (error) {
      if (error.message === 'FORBIDDEN_POLICY_DENIED') {
        setState((prev) => ({
          ...prev,
          loading: false,
          authorized: false
        }));
        return;
      }

      setState((prev) => ({ ...prev, loading: false }));
      addToast('Admin Panel Error', error.message, 'error');
      addLog('ADMIN_PANEL_LOAD_FAILED', error.message, 'error');
    }
  }, [session, addLog, addToast]);

  useEffect(() => {
    if (!session?.accessToken || !session?.sessionId) {
      return;
    }

    const timer = setTimeout(() => {
      void loadAdminData();
    }, 0);

    return () => clearTimeout(timer);
  }, [session?.accessToken, session?.sessionId, loadAdminData]);

  const totals = useMemo(() => state.overview?.totals || null, [state.overview]);
  const accountSequenceMap = useMemo(() => {
    const map = new Map();
    state.accounts.forEach((account, index) => {
      map.set(account.accountId, toSixDigits(index));
    });
    return map;
  }, [state.accounts]);

  const getDisplayAccountId = (rawId, fallbackIndex = 0) => {
    const normalized = toAccountId(rawId);
    return accountSequenceMap.get(normalized) || toSixDigits(fallbackIndex);
  };

  const setRowLoading = (withdrawalId, value) => {
    setActionLoading((prev) => ({ ...prev, [withdrawalId]: value }));
  };

  const handleApprove = async (withdrawalId, force = false) => {
    setRowLoading(withdrawalId, true);
    try {
      await adminApi.approveWithdrawal(withdrawalId, { force }, session);
      addToast('Success', force ? 'Withdrawal force approved' : 'Withdrawal approved', 'success');
      addLog('ADMIN_WITHDRAWAL_APPROVED', { withdrawalId, force });
      await loadAdminData();
    } catch (error) {
      addToast('Approve Failed', error.message, 'error');
      addLog('ADMIN_WITHDRAWAL_APPROVE_FAILED', error.message, 'error');
    } finally {
      setRowLoading(withdrawalId, false);
    }
  };

  const handleReject = async (withdrawalId) => {
    setRowLoading(withdrawalId, true);
    try {
      await adminApi.rejectWithdrawal(withdrawalId, { reason: 'Rejected by admin' }, session);
      addToast('Success', 'Withdrawal rejected and refunded', 'success');
      addLog('ADMIN_WITHDRAWAL_REJECTED', { withdrawalId });
      await loadAdminData();
    } catch (error) {
      addToast('Reject Failed', error.message, 'error');
      addLog('ADMIN_WITHDRAWAL_REJECT_FAILED', error.message, 'error');
    } finally {
      setRowLoading(withdrawalId, false);
    }
  };

  const handleProcessQueue = async () => {
    try {
      await adminApi.processWithdrawalQueue({ limit: 25 }, session);
      addToast('Success', 'Withdrawal processing queue executed', 'success');
      addLog('ADMIN_WITHDRAWAL_QUEUE_PROCESSED', 'Manual queue processing triggered');
      await loadAdminData();
    } catch (error) {
      addToast('Queue Failed', error.message, 'error');
      addLog('ADMIN_WITHDRAWAL_QUEUE_FAILED', error.message, 'error');
    }
  };

  if (!state.authorized) {
    return (
      <section className="panel stack admin-panel">
        <div className="admin-header-row">
          <div>
            <h2>Admin Console</h2>
            <p className="muted">Admin access is required for this module.</p>
          </div>
          <div className="button-row">
            <button className="btn ghost" onClick={() => void loadAdminData()} disabled={state.loading}>
              {state.loading ? 'Checking...' : 'Retry'}
            </button>
          </div>
        </div>

        <div className="session-info tx-empty">
          Your current session is not authorized for admin access. If this should be an admin account, confirm that the email is included in <strong>ADMIN_IDENTIFIERS</strong> and restart the backend so the new allowlist is loaded.
        </div>
      </section>
    );
  }

  return (
    <section className="panel stack admin-panel">
      <div className="admin-header-row">
        <div>
          <h2>Admin Console</h2>
          <p className="muted">Live operational visibility across users, accounts, sessions, and ledger.</p>
        </div>
        <div className="button-row">
          <button className="btn ghost" onClick={() => void handleProcessQueue()} disabled={state.loading}>
            Process Queue
          </button>
          <button className="btn ghost" onClick={() => void loadAdminData()} disabled={state.loading}>
            {state.loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {totals && (
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <span>Total Users</span>
            <strong>{totals.users}</strong>
          </div>
          <div className="admin-stat-card">
            <span>Active Sessions</span>
            <strong>{totals.activeSessions}</strong>
          </div>
          <div className="admin-stat-card">
            <span>Wallet Accounts</span>
            <strong>{totals.accounts}</strong>
          </div>
          <div className="admin-stat-card">
            <span>Ledger Entries</span>
            <strong>{totals.ledgerEntries}</strong>
          </div>
          <div className="admin-stat-card">
            <span>Ledger Net</span>
            <strong>{formatCurrency(totals.netAmount)}</strong>
          </div>
          <div className="admin-stat-card">
            <span>Ledger Absolute</span>
            <strong>{formatCurrency(totals.absoluteAmount)}</strong>
          </div>
          <div className="admin-stat-card">
            <span>Total Withdrawals</span>
            <strong>{totals.withdrawals || 0}</strong>
          </div>
          <div className="admin-stat-card">
            <span>Waiting Admin</span>
            <strong>{totals.waitingAdmin || 0}</strong>
          </div>
          <div className="admin-stat-card">
            <span>Escrow Account</span>
            <strong>{totals.escrowOwnerName || 'Dummy Escrow Account'}</strong>
          </div>
          <div className="admin-stat-card">
            <span>Escrow Balance</span>
            <strong>{formatCurrency(totals.escrowBalance || 0)}</strong>
          </div>
        </div>
      )}

      <div className="admin-sections-grid">
        <div className="admin-section">
          <h3>Users</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User #</th>
                  <th>Identifier</th>
                  <th>Roles</th>
                  <th>Verified</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {state.users.map((user, index) => (
                  <tr key={user.id}>
                    <td>{index + 1}</td>
                    <td>{user.identifier}</td>
                    <td>
                      <span className={roleBadgeClass(user.roles)}>{(user.roles || []).join(', ')}</span>
                    </td>
                    <td>{user.emailVerified ? 'Yes' : 'No'}</td>
                    <td>{formatDate(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-section">
          <h3>Accounts</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Email</th>
                  <th>Balance</th>
                  <th>Entries</th>
                </tr>
              </thead>
              <tbody>
                {state.accounts.map((account) => (
                  <tr key={account.accountId}>
                    <td>{getDisplayAccountId(account.accountId)}</td>
                    <td>{account.identifier || 'N/A'}</td>
                    <td>{formatCurrency(account.balance)}</td>
                    <td>{account.ledgerEntries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-section">
          <h3>Recent Ledger</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Account</th>
                  <th>Amount</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {state.ledger.map((entry, index) => (
                  <tr key={entry.id}>
                    <td>{entry.transactionType}</td>
                    <td>#{getDisplayAccountId(entry.accountId, index)}</td>
                    <td>{formatCurrency(entry.amount)}</td>
                    <td>{formatDate(entry.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-section">
          <h3>Recent Sessions</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Session</th>
                  <th>Revoked</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {state.sessions.map((sessionRow, index) => (
                  <tr key={sessionRow.sessionId}>
                    <td>{`#${getDisplayAccountId(sessionRow.userId, index)}`}</td>
                    <td>{sessionRow.sessionId.slice(0, 12)}...</td>
                    <td>{sessionRow.revoked ? 'Yes' : 'No'}</td>
                    <td>{formatDate(sessionRow.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-section admin-section-wide">
          <h3>Withdrawal Queue</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Amount</th>
                  <th>Risk</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.withdrawals.map((item, index) => (
                  <tr key={item.id}>
                    <td>{`#${getDisplayAccountId(item.userId, index)}`}</td>
                    <td>{formatCurrency(item.amount)}</td>
                    <td>{item.riskLevel}</td>
                    <td>{item.status}</td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>
                      <div className="button-row">
                        <button
                          className="btn ghost btn-mini"
                          onClick={() => void handleApprove(item.id, false)}
                          disabled={Boolean(actionLoading[item.id]) || item.status === 'SUCCESS' || item.status === 'REJECTED'}
                        >
                          Approve
                        </button>
                        <button
                          className="btn danger btn-mini"
                          onClick={() => void handleReject(item.id)}
                          disabled={Boolean(actionLoading[item.id]) || item.status === 'SUCCESS' || item.status === 'REJECTED'}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-section admin-section-wide">
          <h3>Admin Audit Logs</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {state.adminLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDate(log.created_at)}</td>
                    <td>{log.admin_id}</td>
                    <td>{log.action}</td>
                    <td>{log.target_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

AdminPanel.propTypes = {
  session: PropTypes.shape({
    sessionId: PropTypes.string,
    accessToken: PropTypes.string
  }).isRequired,
  addLog: PropTypes.func.isRequired,
  addToast: PropTypes.func.isRequired
};
