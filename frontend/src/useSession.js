import { useState, useEffect } from 'react';

const STORAGE_KEY = 'wallet-console-session';

export function useSession() {
  const [session, setSession] = useState(() => {
    const empty = { accessToken: '', refreshToken: '', sessionId: '', identifier: '' };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return empty;
    }

    try {
      const parsed = JSON.parse(raw);
      return { ...empty, ...parsed };
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return empty;
    }
  });

  useEffect(() => {
    const handleUpdate = (e) => {
      setSession(prev => ({ ...prev, ...e.detail }));
    };
    window.addEventListener('session-updated', handleUpdate);
    
    return () => {
      window.removeEventListener('session-updated', handleUpdate);
    };
  }, []);

  const saveSession = (newSession) => {
    setSession(newSession);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
  };

  const clearSession = () => {
    const empty = { accessToken: '', refreshToken: '', sessionId: '', identifier: '' };
    setSession(empty);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
  };

  const updateTokens = (updates) => {
    const merged = { ...session, ...updates };
    saveSession(merged);
  };

  return { session, saveSession, clearSession, updateTokens };
}
