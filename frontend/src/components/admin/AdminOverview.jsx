import { Users, Monitor, Wallet, BookOpen, Banknote, Clock, Shield, PiggyBank } from 'lucide-react';

const formatCurrency = (value) => Number(value || 0).toFixed(2);

const STAT_CARDS = [
  { key: 'users', label: 'Total Users', icon: Users, getValue: (t) => t.users },
  { key: 'activeSessions', label: 'Active Sessions', icon: Monitor, getValue: (t) => t.activeSessions },
  { key: 'accounts', label: 'Wallet Accounts', icon: Wallet, getValue: (t) => t.accounts },
  { key: 'ledgerEntries', label: 'Ledger Entries', icon: BookOpen, getValue: (t) => t.ledgerEntries },
  { key: 'netAmount', label: 'Ledger Net', icon: Banknote, getValue: (t) => `₹${formatCurrency(t.netAmount)}` },
  { key: 'absoluteAmount', label: 'Ledger Absolute', icon: Banknote, getValue: (t) => `₹${formatCurrency(t.absoluteAmount)}` },
  { key: 'withdrawals', label: 'Total Withdrawals', icon: Banknote, getValue: (t) => t.withdrawals || 0 },
  { key: 'waitingAdmin', label: 'Waiting Admin', icon: Clock, getValue: (t) => t.waitingAdmin || 0 },
  { key: 'escrowOwner', label: 'Escrow Account', icon: Shield, getValue: (t) => t.escrowOwnerName || 'Dummy Escrow' },
  { key: 'escrowBalance', label: 'Escrow Balance', icon: PiggyBank, getValue: (t) => `₹${formatCurrency(t.escrowBalance || 0)}` },
];

export function AdminOverview({ totals }) {
  if (!totals) {
    return <div className="admin-empty">No overview data available.</div>;
  }

  return (
    <div className="admin-stats-grid">
      {STAT_CARDS.map(card => {
        const Icon = card.icon;
        return (
          <div key={card.key} className="admin-stat-card">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Icon size={14} />
              {card.label}
            </span>
            <strong>{card.getValue(totals)}</strong>
          </div>
        );
      })}
    </div>
  );
}
