import { useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useSession } from './useSession';
import { useToast } from './useToast';
import { ToastContainer } from './components/Toast';
import { ThemeToggle } from './components/ThemeToggle';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';

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
      <div className="backdrop"></div>
      
      <main className="app-shell">
        <header className="header" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Simple logo indicator */}
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--accent)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontWeight: 'bold' }}>
              W
            </div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>DBT Wallet</h2>
          </div>
          <ThemeToggle />
        </header>

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
          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </Router>
  );
}

export default App;
