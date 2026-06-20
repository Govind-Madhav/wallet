const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

export function AdminSessions({ sessions }) {
  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h3>Active Sessions</h3>
        <span className="status-pill neutral">{sessions.length} records</span>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Session ID</th>
              <th>Status</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr><td colSpan={4} className="admin-empty">No sessions found.</td></tr>
            ) : (
              sessions.map((sessionRow) => (
                <tr key={sessionRow.sessionId}>
                  <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                    {sessionRow.identifier || sessionRow.userId}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {sessionRow.sessionId.slice(0, 12)}...
                  </td>
                  <td>
                    <span className={`status-pill ${sessionRow.revoked ? 'danger' : 'success'}`}>
                      {sessionRow.revoked ? 'Revoked' : 'Active'}
                    </span>
                  </td>
                  <td>{formatDate(sessionRow.expiresAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
