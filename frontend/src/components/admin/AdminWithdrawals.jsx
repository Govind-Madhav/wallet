import { CheckCircle, XCircle, Zap } from 'lucide-react';

const formatCurrency = (value) => Number(value || 0).toFixed(2);

const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

const getStatusPill = (status) => {
  if (!status) return 'neutral';
  const s = status.toUpperCase();
  if (s.includes('SUCCESS') || s.includes('COMPLETED')) return 'success';
  if (s.includes('REJECT') || s.includes('FAILED')) return 'danger';
  if (s.includes('PENDING') || s.includes('PROCESSING')) return 'pending';
  return 'neutral';
};

const getRiskPill = (risk) => {
  if (!risk) return 'neutral';
  const r = risk.toUpperCase();
  if (r === 'HIGH') return 'danger';
  if (r === 'MEDIUM') return 'warning';
  return 'success';
};

export function AdminWithdrawals({ withdrawals, actionLoading, onApprove, onReject, onProcessQueue, loading }) {
  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h3>Withdrawal Queue</h3>
        <div className="button-row">
          <button className="btn ghost btn-mini" onClick={() => void onProcessQueue()} disabled={loading}>
            <Zap size={14} />
            Process Queue
          </button>
          <span className="status-pill neutral">{withdrawals.length} records</span>
        </div>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Amount</th>
              <th>Risk</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {withdrawals.length === 0 ? (
              <tr><td colSpan={6} className="admin-empty">No withdrawals found.</td></tr>
            ) : (
              withdrawals.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                    {item.identifier || item.userId}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>₹{formatCurrency(item.amount)}</td>
                  <td>
                    <span className={`status-pill ${getRiskPill(item.riskLevel)}`}>
                      {item.riskLevel}
                    </span>
                  </td>
                  <td>
                    <span className={`status-pill ${getStatusPill(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>
                    <div className="button-row">
                      <button
                        className="btn ghost btn-mini"
                        onClick={() => void onApprove(item.id, false)}
                        disabled={Boolean(actionLoading[item.id]) || item.status === 'SUCCESS' || item.status === 'REJECTED'}
                        title="Approve withdrawal"
                      >
                        <CheckCircle size={13} />
                        Approve
                      </button>
                      <button
                        className="btn danger btn-mini"
                        onClick={() => void onReject(item.id)}
                        disabled={Boolean(actionLoading[item.id]) || item.status === 'SUCCESS' || item.status === 'REJECTED'}
                        title="Reject withdrawal"
                      >
                        <XCircle size={13} />
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
