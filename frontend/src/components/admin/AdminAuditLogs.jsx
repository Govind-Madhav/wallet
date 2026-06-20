const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

export function AdminAuditLogs({ logs }) {
  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h3>Admin Audit Logs</h3>
        <span className="status-pill neutral">{logs.length} records</span>
      </div>
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
            {logs.length === 0 ? (
              <tr><td colSpan={4} className="admin-empty">No audit logs found.</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDate(log.created_at)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.admin_id}</td>
                  <td>
                    <span className="status-pill info">{log.action}</span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.target_id}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
