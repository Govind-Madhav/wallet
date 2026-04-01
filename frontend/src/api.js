class ApiError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ApiError';
    this.details = details;
  }
}

export async function request(path, options = {}) {
  const { session, _retry, ...fetchOptions } = options;
  const headers = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers
  };

  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  const response = await fetch(path, {
    method: fetchOptions.method || 'GET',
    headers,
    body: fetchOptions.body ? JSON.stringify(fetchOptions.body) : undefined
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = { message: 'No JSON response body' };
  }

  if (!response.ok) {
    const message = data?.error || data?.message || `HTTP ${response.status}`;
    
    // Auto-refresh token if expired
    if (!_retry && (response.status === 401 || message === 'ACCESS_TOKEN_EXPIRED') && session?.refreshToken && session?.sessionId) {
      try {
        const refreshRes = await fetch('/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: session.refreshToken, sessionId: session.sessionId })
        });
        
        if (!refreshRes.ok) throw new Error('Refresh failed');
        const refreshData = await refreshRes.json();
        
        session.accessToken = refreshData.accessToken;
        if (refreshData.refreshToken) session.refreshToken = refreshData.refreshToken;
        
        // Notify React to update global state seamlessly
        window.dispatchEvent(new CustomEvent('session-updated', { detail: refreshData }));
        
        // Update persistent storage
        const stored = JSON.parse(localStorage.getItem('wallet-console-session') || '{}');
        localStorage.setItem('wallet-console-session', JSON.stringify({ ...stored, ...refreshData }));

        // Retry the original request
        return await request(path, { ...options, _retry: true });
      } catch {
        throw new ApiError('Session expired. Please log out and log back in.', data?.details);
      }
    }

    throw new ApiError(message, data?.details);
  }

  return data;
}

// Auth API mappings
export const authApi = {
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  logout: (body) => request('/auth/logout', { method: 'POST', body }),
  refresh: (body) => request('/auth/refresh', { method: 'POST', body }),
  forgotPassword: (body) => request('/auth/forgot-password', { method: 'POST', body }),
  resetPassword: (body) => request('/auth/reset-password', { method: 'POST', body }),
  verifyEmail: (body) => request('/auth/verify-email', { method: 'POST', body }),
  resendVerification: (body) => request('/auth/resend-verification', { method: 'POST', body })
};

// Wallet API mappings
export const walletApi = {
  getBalance: (session) => request('/api/wallet/balance', { session }),
  deposit: (body, session) => request('/api/wallet/deposit', { method: 'POST', body, session }),
  withdraw: (body, session) => request('/api/wallet/withdraw', { method: 'POST', body, session }),
  transfer: (body, session) => request('/api/wallet/transfer', { method: 'POST', body, session })
};
