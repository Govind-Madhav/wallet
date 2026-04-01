const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const Auth = require('./index');
const SqliteStorageAdapter = require('./adapters/storage/sqlite');
const { sqlite } = require('./db');

const app = express();

const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}

app.use(cors({
    origin: CORS_ORIGIN,
    credentials: true
}));

app.use(express.json());
app.set('trust proxy', 1);

const authLimiter = rateLimit({
    windowMs: Number.parseInt(process.env.AUTH_RATE_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: Number.parseInt(process.env.AUTH_RATE_MAX, 10) || 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT_EXCEEDED' }
});

const authLoginLimiter = rateLimit({
    windowMs: Number.parseInt(process.env.AUTH_LOGIN_RATE_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: Number.parseInt(process.env.AUTH_LOGIN_RATE_MAX, 10) || 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'TOO_MANY_LOGIN_ATTEMPTS' }
});

const dbAdapter = new SqliteStorageAdapter();

const mockClaimsResolver = async (params) => {
    return { roles: ['user'], tenant: params.context?.tenant || 'default' };
};

const mockPolicyResolver = async ({ policy, claims, context }) => {
    const roles = Array.isArray(claims?.roles) ? claims.roles : [];
    if (policy === 'auth:admin') return roles.includes('admin');
    if (policy === 'auth:user') return roles.includes('user') || roles.includes('admin');
    return false;
};

const authSystem = Auth.init({
    storageAdapter: dbAdapter,
    claimsResolver: mockClaimsResolver,
    policyResolver: mockPolicyResolver,
    jwtSecret: process.env.JWT_SECRET,
    accessExpiry: process.env.ACCESS_EXPIRY || '1m',
    refreshExpiryMs: Number.parseInt(process.env.REFRESH_EXPIRY_MS, 10) || 1000 * 60 * 60 * 24,
    trustJwtClaims: true
});

// In development, log password reset token so you can test without email
authSystem.onPasswordResetRequested(({ identifier, rawToken, expiresAt }) => {
    if (process.env.NODE_ENV !== 'production') {
        console.log('[Dev] Password reset requested for:', identifier);
        console.log('[Dev] Reset token (use in Reset Password form):', rawToken);
        console.log('[Dev] Expires at:', expiresAt);
    }
});

app.use('/auth', authLimiter);
app.use('/auth/login', authLoginLimiter);
app.use('/auth', authSystem.router);

app.get('/healthz', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'auth-engine',
        uptimeSeconds: Math.floor(process.uptime())
    });
});

app.get('/readyz', async (req, res) => {
    try {
        sqlite.prepare('SELECT 1 as ready').get();
        return res.status(200).json({ status: 'ready' });
    } catch (err) {
        console.error('Readiness check failed:', err);
        return res.status(503).json({ status: 'not_ready' });
    }
});

let server = null;

const gracefulShutdown = async (signal) => {
    console.log(`${signal} received. Shutting down auth-engine gracefully...`);

    const closeServer = () => new Promise((resolve) => {
        if (!server) return resolve();
        server.close(() => resolve());
    });

    await closeServer();
    sqlite.close();
    process.exit(0);
};

process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
});

server = app.listen(PORT, () => {
    console.log(`Auth Engine server running on http://localhost:${PORT}`);
    console.log('SQLite Database Storage Adapter is active.');
});
