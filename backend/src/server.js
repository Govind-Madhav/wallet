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
const createAdminRouter = require('./admin-engine/router/adminRouter');
const { query, pool } = require('./config/db');
const { sendEmailVerification, sendPasswordResetEmail, sendWalletSecurityAlertEmail } = require('./auth-engine/services/emailSender');

const app = express();
app.use(express.json());
app.set('trust proxy', 1);

const frontendDir = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDir));

// Health check endpoint for Docker & CI/CD verification
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'UP',
        timestamp: new Date().toISOString(),
        service: 'wallet-app'
    });
});

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

const adminLimiter = rateLimit({
    windowMs: Number.parseInt(process.env.ADMIN_RATE_WINDOW_MS, 10) || 60 * 1000,
    max: Number.parseInt(process.env.ADMIN_RATE_MAX, 10) || 240,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT_EXCEEDED' }
});

const parseMetadata = (metadata) => {
    if (!metadata) return {};
    if (typeof metadata === 'object') return metadata;

    try {
        return JSON.parse(metadata);
    } catch {
        return {};
    }
};

const parseBooleanLike = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n', ''].includes(normalized)) return false;
    }

    return false;
};

const resolveMetadataBoolean = (metadata, keys) => {
    if (!metadata || typeof metadata !== 'object') return false;

    for (const key of keys) {
        if (Object.hasOwn(metadata, key)) {
            return parseBooleanLike(metadata[key]);
        }
    }

    return false;
};

const parseAdminIdentifiers = () => {
    const raw = process.env.ADMIN_IDENTIFIERS || process.env.ADMIN_EMAILS || '';
    const entries = raw
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

    return new Set(entries);
};

const adminIdentifiers = parseAdminIdentifiers();

const resolveRolesForUser = (user) => {
    const roles = new Set(['user']);
    const metadata = parseMetadata(user?.metadata);

    const metadataRoles = Array.isArray(metadata.roles)
        ? metadata.roles
        : [metadata.role].filter(Boolean);

    for (const role of metadataRoles) {
        if (typeof role === 'string' && role.trim()) {
            roles.add(role.trim().toLowerCase());
        }
    }

    if (metadata.isAdmin === true) {
        roles.add('admin');
    }

    const identifier = String(user?.identifier || '').toLowerCase();
    if (identifier && adminIdentifiers.has(identifier)) {
        roles.add('admin');
    }

    return [...roles];
};

const resolveAdminRole = (metadata) => {
    const explicit = typeof metadata?.adminRole === 'string' ? metadata.adminRole.trim().toUpperCase() : null;
    if (explicit === 'SUPER_ADMIN' || explicit === 'BRANCH_MANAGER') return explicit;

    const roles = Array.isArray(metadata?.roles)
        ? metadata.roles.map((role) => String(role).trim().toLowerCase())
        : [];

    if (roles.includes('super_admin')) return 'SUPER_ADMIN';
    if (roles.includes('branch_manager')) return 'BRANCH_MANAGER';
    if (roles.includes('admin')) return 'BRANCH_MANAGER';
    return null;
};


const claimsResolver = async ({ userId, sessionId, context }) => {
    const user = await authAdapter.findUserById(userId);
    const metadata = parseMetadata(user?.metadata);
    const walletAccountId = userId.startsWith('user_') ? userId.replace('user_', '') : userId;
    return {
        accountId: walletAccountId,
        roles: resolveRolesForUser(user),
        adminRole: resolveAdminRole(metadata),
        kycVerified: resolveMetadataBoolean(metadata, ['kycVerified', 'kyc_verified', 'isKycVerified']),
        trustedUser: resolveMetadataBoolean(metadata, ['trustedUser', 'trusted_user', 'isTrustedUser'])
    };
};


const policyResolver = async ({ policy, claims, context }) => {
    const roles = Array.isArray(claims?.roles) ? claims.roles : [];

    if (policy === 'wallet:admin') return roles.includes('admin');
    if (policy === 'wallet:admin:force') return roles.includes('super_admin');
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
const adminRouter = createAdminRouter({
    query,
    walletCore,
    maxPageSize: Number.parseInt(process.env.ADMIN_MAX_PAGE_SIZE, 10) || 200
});
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
    },
    notifySecurityEvent: async (event) => {
        const accountId = String(event?.accountId || '').trim();
        if (!accountId) return;

        const userId = accountId.startsWith('user_') ? accountId : `user_${accountId}`;
        const user = await authAdapter.findUserById(userId);
        if (!user?.identifier) return;

        const otpChallenge = event?.otpChallenge || null;
        const securityEvents = Array.isArray(event?.securityEvents) ? event.securityEvents : [];

        const lines = event?.type === 'WITHDRAWAL_OTP_REQUIRED'
            ? [
                'A withdrawal is waiting for OTP verification before it can be completed.',
                `Transaction ID: ${otpChallenge?.transactionId || 'N/A'}`,
                `OTP expires at: ${otpChallenge?.expiresAt || 'N/A'}`
            ]
            : [];

        for (const item of securityEvents) {
            lines.push(item.message || item.type);
        }

        await sendWalletSecurityAlertEmail({
            toEmail: user.identifier,
            subject: 'DBT Wallet security alert',
            heading: event?.type === 'WITHDRAWAL_OTP_REQUIRED' ? 'OTP verification required' : 'Security alert',
            messageLines: lines,
            details: {
                accountId,
                ipAddress: otpChallenge?.ipAddress || null,
                deviceId: otpChallenge?.deviceId || null,
                amount: otpChallenge?.amount || null
            }
        });
    }
});

const JOB_INTERVAL_MS = Number.parseInt(process.env.WALLET_JOB_INTERVAL_MS, 10) || 5 * 60 * 1000;
const ESCROW_SYNC_INTERVAL_MS = Number.parseInt(process.env.ESCROW_SYNC_INTERVAL_MS, 10) || 24 * 60 * 60 * 1000;
const backgroundJobs = [];

const scheduleJob = (fn, intervalMs) => {
    const run = async () => {
        try {
            await fn();
        } catch (error) {
            console.error('[Background Job Error]', error);
        }
    };

    void run();
    const timer = setInterval(() => {
        void run();
    }, intervalMs);
    backgroundJobs.push(timer);
};

// Public Routes
app.use('/auth', authLimiter);
app.use('/auth/login', authLoginLimiter);
app.use('/auth', authSystem.router);

// Protected Routes (The Magic happens here)
app.use('/api/wallet', walletLimiter, authSystem.authenticate, walletRouter);
app.use('/api/admin', adminLimiter, authSystem.authenticate, authSystem.authorize('wallet:admin'), adminRouter);

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

    for (const timer of backgroundJobs) {
        clearInterval(timer);
    }

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

const startServer = async () => {
    try {
        if (process.env.DATABASE_URL) {
            console.log('Building schemas dynamically...');
            await authAdapter.initSchema();
            await walletCore.initSchema();
            scheduleJob(() => walletCore.adapter.ensureDummyEscrowAccount(), ESCROW_SYNC_INTERVAL_MS);
        } else {
            console.log('DATABASE_URL not set; skipping dynamic DB schema initialization.');
        }
    } catch (e) {
        console.warn('Database initialization warning (running in standalone/container mode):', e.message);
    }

    server = app.listen(PORT, () => {
        console.log(`Dual-Engine Backend running at http://localhost:${PORT}`);
        console.log('   Auth Engine (Knex Schema Builder): /auth/*');
        console.log('   Wallet Engine (Raw MySQL): /api/wallet/*');
        console.log('   Admin Engine: /api/admin/*');
    });
};

void startServer();
