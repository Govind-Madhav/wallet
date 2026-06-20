class ApiError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ApiError';
    this.details = details;
  }
}

const STORAGE_KEY = 'wallet-console-session';

const buildPath = (basePath, options = {}) => {
  const params = new URLSearchParams();
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
};

const parseResponseBody = async (response) => {
  try {
    return await response.json();
  } catch {
    return { message: 'No JSON response body' };
  }
};

const shouldAttemptRefresh = ({ retry, response, message, session }) => {
  if (retry) return false;
  if (!session?.refreshToken || !session?.sessionId) return false;
  return response.status === 401 || message === 'ACCESS_TOKEN_EXPIRED';
};

const performTokenRefresh = async (session) => {
  const refreshRes = await fetch('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken, sessionId: session.sessionId })
  });

  if (!refreshRes.ok) {
    throw new Error('Refresh failed');
  }

  const refreshData = await refreshRes.json();
  session.accessToken = refreshData.accessToken;
  if (refreshData.refreshToken) session.refreshToken = refreshData.refreshToken;

  globalThis.dispatchEvent(new CustomEvent('session-updated', { detail: refreshData }));

  const storage = globalThis.sessionStorage;
  const stored = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, ...refreshData }));
};

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

  const data = await parseResponseBody(response);

  if (!response.ok) {
    const message = data?.error || data?.message || `HTTP ${response.status}`;

    if (shouldAttemptRefresh({ retry: _retry, response, message, session })) {
      try {
        await performTokenRefresh(session);
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
  getRecentTransactions: (session, limit = 5) => request(`/api/wallet/recent-transactions?limit=${limit}`, { session }),
  getWithdrawals: (session, limit = 10) => request(`/api/wallet/withdrawals?limit=${limit}`, { session }),
  deposit: (body, session) => request('/api/wallet/deposit', { method: 'POST', body, session }),
  withdraw: (body, session) => request('/api/wallet/withdraw', { method: 'POST', body, session }),
  transfer: (body, session) => request('/api/wallet/transfer', { method: 'POST', body, session })
};

export const adminApi = {
  getOverview: (session) => request('/api/admin/overview', { session }),
  getUsers: (session, options = {}) => request(buildPath('/api/admin/users', options), { session }),
  getAccounts: (session, options = {}) => request(buildPath('/api/admin/accounts', options), { session }),
  getLedger: (session, options = {}) => request(buildPath('/api/admin/ledger', options), { session }),
  getSessions: (session, options = {}) => request(buildPath('/api/admin/sessions', options), { session }),
  getWithdrawals: (session, options = {}) => request(buildPath('/api/admin/withdrawals', options), { session }),
  approveWithdrawal: (withdrawalId, body, session) => request(`/api/admin/withdrawals/${withdrawalId}/approve`, { method: 'POST', body, session }),
  rejectWithdrawal: (withdrawalId, body, session) => request(`/api/admin/withdrawals/${withdrawalId}/reject`, { method: 'POST', body, session }),
  processWithdrawalQueue: (body, session) => request('/api/admin/withdrawals/process-queue', { method: 'POST', body, session }),
  getAdminLogs: (session, options = {}) => request(buildPath('/api/admin/admin-logs', options), { session })
};
