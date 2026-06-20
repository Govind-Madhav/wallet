const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

const roleBadgeClass = (roles = []) => 
  roles.includes('admin') ? 'role-badge admin' : 'role-badge';

const formatCurrency = (value) => Number(value || 0).toFixed(2);

const toSixDigits = (index) => String(index + 1).padStart(6, '0');

export function AdminUsersAccounts({ users, accounts }) {
  return (
    <div className="stack">
      {/* Users Table */}
      <div className="admin-section">
        <div className="admin-section-header">
          <h3>Users</h3>
          <span className="status-pill neutral">{users.length} records</span>
        </div>
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
              {users.length === 0 ? (
                <tr><td colSpan={5} className="admin-empty">No users found.</td></tr>
              ) : (
                users.map((user, index) => (
                  <tr key={user.id}>
                    <td>{index + 1}</td>
                    <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{user.identifier}</td>
                    <td>
                      <span className={roleBadgeClass(user.roles)}>{(user.roles || []).join(', ')}</span>
                    </td>
                    <td>
                      <span className={`status-pill ${user.emailVerified ? 'success' : 'warning'}`}>
                        {user.emailVerified ? 'Verified' : 'Pending'}
                      </span>
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="admin-section">
        <div className="admin-section-header">
          <h3>Accounts</h3>
          <span className="status-pill neutral">{accounts.length} records</span>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Account ID</th>
                <th>Email</th>
                <th>Balance</th>
                <th>Entries</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr><td colSpan={4} className="admin-empty">No accounts found.</td></tr>
              ) : (
                accounts.map((account) => (
                  <tr key={account.accountId}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{toSixDigits(accounts.findIndex((a) => a.accountId === account.accountId))}</td>
                    <td>{account.identifier || 'N/A'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>₹{formatCurrency(account.balance)}</td>
                    <td>{account.ledgerEntries}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
