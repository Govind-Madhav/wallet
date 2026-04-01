// frontend/src/components/ActivityLog.jsx
import { useEffect, useRef } from 'react';

export function ActivityLog({ logs }) {
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="panel">
      <h2>Activity Log</h2>
      <pre className="log" ref={logRef}>
        {logs.map((log, index) => (
          <div key={index} style={{ marginBottom: '1rem' }}>
            {log.time} [{log.type.toUpperCase()}] {log.title}
            {log.body && `\n${log.body}`}
          </div>
        ))}
      </pre>
    </div>
  );
}
