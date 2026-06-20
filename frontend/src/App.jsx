import { useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useSession } from './useSession';
import { useToast } from './useToast';
import { ToastContainer } from './components/Toast';
import { ThemeToggle } from './components/ThemeToggle';
import { AppNav } from './components/AppNav';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';

function App() {
  const { session, clearSession, updateTokens } = useSession();
  const { toasts, addToast, removeToast } = useToast();
  const logsRef = useRef([{
    time: new Date().toLocaleTimeString(),
    type: 'SYSTEM',
    title: 'Frontend Ready',
    body: 'React Router Bootstrapped successfully'
  }]);

  const addLog = useCallback((title, body, type = 'INFO') => {
    logsRef.current = [...logsRef.current, {
      time: new Date().toLocaleTimeString(),
      type: type,
      title: title,
      body: typeof body === 'string' ? body : JSON.stringify(body, null, 2)
    }];
  }, []);

  return (
    <Router>
      <main className="app-shell">
        <header className="header">
          <div className="brand-row">
            <div className="brand-mark" aria-hidden="true">W</div>
            <div>
              <p className="brand-kicker">Secure Finance</p>
              <h2 className="brand-title">DBT Wallet</h2>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <AppNav session={session} />

        <Routes>
          <Route 
            path="/auth" 
            element={
              <AuthPage 
                session={session} 
                updateTokens={updateTokens} 
                addLog={addLog} 
                addToast={addToast} 
              />
            } 
          />
          <Route 
            path="/" 
            element={
              <DashboardPage 
                session={session} 
                clearSession={clearSession} 
                addLog={addLog} 
                addToast={addToast} 
              />
            } 
          />
          <Route
            path="/transactions"
            element={
              <TransactionsPage
                session={session}
                addLog={addLog}
                addToast={addToast}
              />
            }
          />
          <Route
            path="/profile"
            element={
              <ProfilePage
                session={session}
                addLog={addLog}
                addToast={addToast}
              />
            }
          />
          <Route
            path="/admin"
            element={
              <AdminPage
                session={session}
                addLog={addLog}
                addToast={addToast}
              />
            }
          />
          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </Router>
  );
}

export default App;
