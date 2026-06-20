import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { 
  LayoutDashboard, Users, BookOpen, Monitor, 
  Banknote, FileText, ArrowLeft, RefreshCw 
} from 'lucide-react';
import { adminApi } from '../api';

import { AdminOverview } from '../components/admin/AdminOverview';
import { AdminUsersAccounts } from '../components/admin/AdminUsersAccounts';
import { AdminLedger } from '../components/admin/AdminLedger';
import { AdminSessions } from '../components/admin/AdminSessions';
import { AdminWithdrawals } from '../components/admin/AdminWithdrawals';
import { AdminAuditLogs } from '../components/admin/AdminAuditLogs';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'users', label: 'Users & Accounts', icon: Users },
  { key: 'ledger', label: 'Ledger', icon: BookOpen },
  { key: 'sessions', label: 'Sessions', icon: Monitor },
  { key: 'withdrawals', label: 'Withdrawals', icon: Banknote },
  { key: 'auditLogs', label: 'Audit Logs', icon: FileText },
];

export function AdminPage({ session, addLog, addToast }) {
  const [activeTab, setActiveTab] = useState('overview');
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

  // Protect route
  if (!session?.sessionId) {
    return <Navigate to="/auth" replace />;
  }

  const loadAdminData = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const [overview, usersRes, accountsRes, ledgerRes, sessionsRes, withdrawalsRes, logsRes] = await Promise.all([
        adminApi.getOverview(session),
        adminApi.getUsers(session, { limit: 20 }),
        adminApi.getAccounts(session, { limit: 20 }),
        adminApi.getLedger(session, { limit: 20 }),
        adminApi.getSessions(session, { limit: 20 }),
        adminApi.getWithdrawals(session, { limit: 20 }),
        adminApi.getAdminLogs(session, { limit: 20 })
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
    return <Navigate to="/" replace />;
  }

  const renderContent = () => {
    if (state.loading) {
      return (
        <div className="admin-content">
          <div className="admin-stats-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: '100px' }} />
            ))}
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'overview':
        return <AdminOverview totals={totals} />;
      case 'users':
        return <AdminUsersAccounts users={state.users} accounts={state.accounts} />;
      case 'ledger':
        return <AdminLedger ledger={state.ledger} accounts={state.accounts} />;
      case 'sessions':
        return <AdminSessions sessions={state.sessions} />;
      case 'withdrawals':
        return (
          <AdminWithdrawals
            withdrawals={state.withdrawals}
            actionLoading={actionLoading}
            onApprove={handleApprove}
            onReject={handleReject}
            onProcessQueue={handleProcessQueue}
            loading={state.loading}
          />
        );
      case 'auditLogs':
        return <AdminAuditLogs logs={state.adminLogs} />;
      default:
        return null;
    }
  };

  return (
    <>
      {/* Admin Header */}
      <div className="admin-header-row">
        <div>
          <Link to="/" className="btn ghost btn-mini" style={{ marginBottom: '0.75rem', display: 'inline-flex' }}>
            <ArrowLeft size={14} />
            Back to Dashboard
          </Link>
          <h1>Admin Console</h1>
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Live operational visibility across users, accounts, sessions, and ledger.
          </p>
        </div>
        <button className="btn ghost" onClick={() => void loadAdminData()} disabled={state.loading}>
          <RefreshCw size={16} className={state.loading ? 'spin' : ''} />
          {state.loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Top Tab Bar */}
      <div className="admin-tabs">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              className={`admin-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon size={16} className="admin-tab-icon" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="admin-content" key={activeTab}>
        {renderContent()}
      </div>
    </>
  );
}

AdminPage.propTypes = {
  session: PropTypes.shape({
    sessionId: PropTypes.string,
    accessToken: PropTypes.string
  }).isRequired,
  addLog: PropTypes.func.isRequired,
  addToast: PropTypes.func.isRequired
};
