import PropTypes from 'prop-types';

const formatCurrency = (value) => Number(value || 0).toFixed(2);

const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

const getTypeColor = (type) => {
  if (!type) return 'var(--text-muted)';
  const t = type.toUpperCase();
  if (t.includes('DEPOSIT')) return 'var(--success)';
  if (t.includes('WITHDRAW')) return 'var(--danger)';
  if (t.includes('TRANSFER')) return 'var(--info)';
  return 'var(--text-muted)';
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

export function AdminLedger({ ledger }) {
  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h3>Ledger Entries</h3>
        <span className="status-pill neutral">{ledger.length} records</span>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Transaction ID</th>
              <th>Type</th>
              <th>Account</th>
              <th>Amount</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 ? (
              <tr><td colSpan={5} className="admin-empty">No ledger entries found.</td></tr>
            ) : (
              ledger.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {entry.referenceId || `LEDGER-${entry.id}`}
                  </td>
                  <td>
                    <span style={{ 
                      color: getTypeColor(entry.transactionType),
                      fontWeight: 600,
                      fontSize: '0.8rem'
                    }}>
                      {entry.transactionType}
                    </span>
                  </td>
                  <td>#{formatAccountShortId(entry.accountId)}</td>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>₹{formatCurrency(entry.amount)}</td>
                  <td>{formatDate(entry.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

AdminLedger.propTypes = {
  ledger: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    referenceId: PropTypes.string,
    transactionType: PropTypes.string,
    accountId: PropTypes.string,
    amount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    createdAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)])
  })).isRequired
};
