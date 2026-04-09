const dotenv = require('dotenv');
const path = require('node:path');

// Load root-level .env so backend works when launched from either root or backend folder.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config();

const express = require('express');
const rateLimit = require('express-rate-limit');

// 1. Auth Engine
const Auth = require('./auth-engine/index'); // Adjust if auth-engine entry is different
const KnexAuthAdapter = require('./auth-engine/adapters/storage/KnexAuthAdapter');
const knex = require('knex');

// 2. Wallet Engine
const WalletCore = require('./wallet-engine/core/WalletCore');
const MysqlWalletAdapter = require('./wallet-engine/adapters/storage/MysqlWalletAdapter');
const createWalletRouter = require('./wallet-engine/router/walletRouter');
const { query, pool } = require('./config/db');
const { sendEmailVerification, sendPasswordResetEmail } = require('./auth-engine/services/emailSender');

const app = express();
app.use(express.json());
app.set('trust proxy', 1);

const frontendDir = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDir));

if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}

// Initialize the Knex Database Connection for the Auth Engine
const dbInstance = knex({
    client: 'mysql2',
    connection: process.env.DATABASE_URL,
});

// Initialize the universal Adapters
const authAdapter = new KnexAuthAdapter(dbInstance);
const walletAdapter = new MysqlWalletAdapter();

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

const walletLimiter = rateLimit({
    windowMs: Number.parseInt(process.env.WALLET_RATE_WINDOW_MS, 10) || 60 * 1000,
    max: Number.parseInt(process.env.WALLET_RATE_MAX, 10) || 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT_EXCEEDED' }
});


const claimsResolver = async ({ userId, sessionId, context }) => {
    
    const walletAccountId = userId.startsWith('user_') ? userId.replace('user_', '') : userId;
    return { accountId: walletAccountId, roles: ['user'] };
};


const policyResolver = async ({ policy, claims, context }) => {
    const roles = Array.isArray(claims?.roles) ? claims.roles : [];

    if (policy === 'wallet:admin') return roles.includes('admin');
    if (policy === 'wallet:user') return roles.includes('user') || roles.includes('admin');

    // Deny unknown policies by default.
    return false;
};

// Booting up the Auth Engine with our SQL Adapter
const authSystem = Auth.init({
    storageAdapter: authAdapter,
    claimsResolver: claimsResolver,
    policyResolver: policyResolver,
    jwtSecret: process.env.JWT_SECRET,
    accessExpiry: '15m',
    refreshExpiryMs: 7 * 24 * 60 * 60 * 1000
});

authSystem.onEmailVerificationRequested(async ({ identifier, rawToken, expiresAt }) => {
    try {
        await sendEmailVerification({
            toEmail: identifier,
            rawToken,
            expiresAt
        });
    } catch (err) {
        console.error('[Email Verification] Failed to send verification email:', err.message);
    }
});

authSystem.onPasswordResetRequested(async ({ identifier, rawToken, expiresAt }) => {
    try {
        await sendPasswordResetEmail({
            toEmail: identifier,
            rawToken,
            expiresAt
        });
    } catch (err) {
        console.error('[Password Reset] Failed to send recovery email:', err.message);
    }

    if (process.env.NODE_ENV !== 'production') {
        console.log('[Dev] Password reset requested for:', identifier);
        console.log('[Dev] Recovery code:', rawToken);
        console.log('[Dev] Expires at:', expiresAt);
    }
});

// Booting up the Wallet Engine with our MySQL Adapter
const walletCore = new WalletCore(walletAdapter);
const walletRouter = createWalletRouter(walletCore, {
    resolveRecipientAccountId: async (email) => {
        if (typeof email !== 'string') return null;
        const normalized = email.trim().toLowerCase();
        if (!normalized) return null;

        const user = await authAdapter.findUserByIdentifier(normalized);
        if (!user?.id) return null;

        return user.id;
    },
    resolveAccountDisplayDetails: async (accountId) => {
        if (typeof accountId !== 'string' || !accountId.trim()) return null;

        const userId = accountId.startsWith('user_') ? accountId : `user_${accountId}`;
        const user = await authAdapter.findUserById(userId);
        if (!user) return null;

        return {
            label: user.identifier,
            email: user.identifier,
            userId: user.id,
            accountId: user.id.startsWith('user_') ? user.id.replace('user_', '') : user.id
        };
    }
});

// Public Routes
app.use('/auth', authLimiter);
app.use('/auth/login', authLoginLimiter);
app.use('/auth', authSystem.router);

// Protected Routes (The Magic happens here)
app.use('/api/wallet', walletLimiter, authSystem.authenticate, walletRouter);

app.get('/healthz', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'dbt-project-wallet',
        uptimeSeconds: Math.floor(process.uptime())
    });
});

app.get('/readyz', async (req, res) => {
    try {
        await query('SELECT 1 AS ready');
        await dbInstance.raw('SELECT 1 AS ready');

        return res.status(200).json({ status: 'ready' });
    } catch (err) {
        console.error('Readiness check failed:', err);
        return res.status(503).json({ status: 'not_ready' });
    }
});

// Catch-all route to serve the SPA for missing API endpoints
app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
        return res.status(404).json({ error: 'Not Found' });
    }
    res.sendFile(path.join(frontendDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;
let server = null;

const gracefulShutdown = async (signal) => {
    console.log(`${signal} received. Shutting down server gracefully...`);

    const closeServer = () => new Promise((resolve) => {
        if (!server) return resolve();
        server.close(() => resolve());
    });

    await closeServer();
    await Promise.allSettled([
        dbInstance.destroy(),
        pool.end()
    ]);

    process.exit(0);
};

process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
});

console.log('Building schemas dynamically...');
// eslint-disable-next-line unicorn/prefer-top-level-await
authAdapter
    .initSchema()
    .then(() => {
        server = app.listen(PORT, () => {
            console.log(`Dual-Engine Backend running at http://localhost:${PORT}`);
            console.log('   Auth Engine (Knex Schema Builder): /auth/*');
            console.log('   Wallet Engine (Raw MySQL): /api/wallet/*');
        });
    })
    .catch((e) => {
        console.error('Failed to boot:', e);
        process.exit(1);
    });
