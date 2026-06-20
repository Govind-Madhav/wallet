// frontend/src/components/SessionPanel.jsx
import PropTypes from 'prop-types';
import { LogOut, Building, AtSign, User, Fingerprint } from 'lucide-react';
import { authApi } from '../api';

const toSixDigits = (index) => String(index + 1).padStart(6, '0');

export function SessionPanel({ session, clearSession, addLog, addToast }) {
  const handleLogout = async () => {
    if (!session.sessionId) {
      addToast('Error', 'No active session', 'error');
      return;
    }
    try {
      await authApi.logout({ sessionId: session.sessionId });
      addToast('Success', 'Logged out successfully', 'success');
      addLog('LOGOUT_SUCCESS', 'Session revoked');
    } catch (err) {
      addToast('Logout Failed', err.message, 'error');
      addLog('LOGOUT_FAILED', err.message, 'error');
    } finally {
      clearSession();
    }
  };

  const initial = session.identifier 
    ? session.identifier.charAt(0).toUpperCase() 
    : '?';

  return (
    <div className="panel stack">
      <div className="profile-header">
        <div className="profile-avatar">{initial}</div>
        <div className="profile-info">
          <div className="profile-name">{session.identifier || 'User'}</div>
          <div className="profile-role">Active Session</div>
        </div>
      </div>

      {session.identifier && (
        <div className="session-info">
          <div className="session-stat">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <User size={14} />
              Username
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{session.identifier}</span>
          </div>
          <div className="session-stat">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Fingerprint size={14} />
              Account ID
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {toSixDigits(0)}
            </span>
          </div>
          <div className="session-stat">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Building size={14} />
              Linked Bank
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>ABC Bank (Demo)</span>
          </div>
          <div className="session-stat">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AtSign size={14} />
              UPI Linkage
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{session.identifier}@abcbank</span>
          </div>
        </div>
      )}

      <div className="button-row">
        <button className="btn danger" onClick={handleLogout} disabled={!session.sessionId} style={{ width: '100%' }}>
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </div>
  );
}

SessionPanel.propTypes = {
  session: PropTypes.shape({
    sessionId: PropTypes.string,
    identifier: PropTypes.string,
    userId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  }).isRequired,
  clearSession: PropTypes.func.isRequired,
  addLog: PropTypes.func.isRequired,
  addToast: PropTypes.func.isRequired
};
