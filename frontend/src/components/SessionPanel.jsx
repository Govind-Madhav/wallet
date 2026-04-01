// frontend/src/components/SessionPanel.jsx
import { authApi } from '../api';

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

  return (
    <div className="panel stack">
      <h2>Account Profile</h2>
      <div className="session-info">
        {session.identifier && (
          <div className="session-stat">
            <span>Email</span>
            <span>{session.identifier}</span>
          </div>
        )}
      </div>

      <div className="button-row">
        <button className="btn danger" onClick={handleLogout} disabled={!session.sessionId}>
          Logout
        </button>
      </div>
    </div>
  );
}
