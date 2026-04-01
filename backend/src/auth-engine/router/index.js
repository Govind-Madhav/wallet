const express = require('express');
const identityEngine = require('../core/identity');
const sessionEngine = require('../core/session');
const tokenEngine = require('../core/token');
const claimsEngine = require('../core/claims');
const passwordResetEngine = require('../core/passwordReset');
const emailVerificationEngine = require('../core/emailVerification');
const events = require('../core/events');
const { z } = require('zod');

const LOGIN_ATTEMPT_WINDOW_MS = Number.parseInt(process.env.LOGIN_ATTEMPT_WINDOW_MS, 10) || 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = Number.parseInt(process.env.LOGIN_LOCKOUT_MS, 10) || 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = Number.parseInt(process.env.LOGIN_MAX_ATTEMPTS, 10) || 5;

const loginAttemptStore = new Map();

const normalizeEmail = (value) => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    const parsed = z.email().safeParse(normalized);
    return parsed.success ? normalized : null;
};

const resolveIdentifier = ({ email, identifier }) => {
    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail) return normalizedEmail;

    if (typeof identifier === 'string') {
        const trimmedIdentifier = identifier.trim();
        if (!trimmedIdentifier) return null;
        return normalizeEmail(trimmedIdentifier);
    }

    return null;
};

const getUserEmail = (user) => {
    const fromIdentifier = normalizeEmail(user?.identifier);
    if (fromIdentifier) return fromIdentifier;

    const metadata = user?.metadata;
    if (!metadata) return null;

    try {
        const parsedMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
        return normalizeEmail(parsedMetadata?.email);
    } catch {
        return null;
    }
};

const registerSchema = z.object({
    email: z.email().trim().max(255).optional(),
    identifier: z.string().trim().min(1).max(255).optional(),
    password: z.string().min(8).max(128),
    metadata: z.record(z.string(), z.unknown()).optional()
});

const loginSchema = z.object({
    email: z.email().trim().max(255).optional(),
    identifier: z.string().trim().min(1).max(255).optional(),
    password: z.string().min(1).max(128)
});

const refreshSchema = z.object({
    refreshToken: z.string().trim().min(1),
    sessionId: z.string().trim().min(1)
});

const logoutSchema = z.object({
    sessionId: z.string().trim().min(1)
});

const forgotPasswordSchema = z.object({
    email: z.email().trim().max(255).optional(),
    identifier: z.string().trim().min(1).max(255).optional()
});

const resetPasswordSchema = z.object({
    token: z.string().trim().min(1),
    newPassword: z.string().min(8).max(128)
});

const resendVerificationSchema = z.object({
    email: z.email().trim().max(255).optional(),
    identifier: z.string().trim().min(1).max(255).optional()
});

const verifyEmailSchema = z.object({
    token: z.string().trim().min(1)
});

const externalAuthSchema = z.object({
    provider: z.string().trim().min(1).max(64),
    token: z.string().trim().min(1),
    profile: z.unknown().optional()
});

const getRequestIp = (req) => (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').toString();

const getLoginAttemptKey = (req, identifier) => `${identifier.toLowerCase()}|${getRequestIp(req)}`;

const consumeLoginLockout = (key) => {
    const now = Date.now();
    const current = loginAttemptStore.get(key);
    if (!current) return { locked: false };

    if (current.lockedUntil && current.lockedUntil > now) {
        return { locked: true, retryAfterSeconds: Math.ceil((current.lockedUntil - now) / 1000) };
    }

    if (current.windowStartedAt + LOGIN_ATTEMPT_WINDOW_MS < now) {
        loginAttemptStore.delete(key);
    }

    return { locked: false };
};

const recordLoginFailure = (key) => {
    const now = Date.now();
    const current = loginAttemptStore.get(key);

    if (!current || current.windowStartedAt + LOGIN_ATTEMPT_WINDOW_MS < now) {
        loginAttemptStore.set(key, {
            attempts: 1,
            windowStartedAt: now,
            lockedUntil: null
        });
        return;
    }

    current.attempts += 1;
    if (current.attempts >= LOGIN_MAX_ATTEMPTS) {
        current.lockedUntil = now + LOGIN_LOCKOUT_MS;
    }
    loginAttemptStore.set(key, current);
};

const clearLoginFailures = (key) => {
    loginAttemptStore.delete(key);
};

const parseRequestBody = (schema, req, res) => {
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
        return res.status(400).json({
            error: 'INVALID_REQUEST_BODY',
            details: z.treeifyError(parsed.error)
        });
    }
    return parsed.data;
};

const getContext = (req) => ({
    requestIp: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'],
    tenant: req.headers['x-tenant-id'] || null
});

const handleLoginSuccess = async (user, req, res) => {
    try {
        const deviceInfo = { userAgent: req.headers['user-agent'] };
        const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
        const tenantId = req.headers['x-tenant-id'] || null;

        const { session, rawRefreshToken } = await sessionEngine.createSession({
            userId: user.id,
            deviceInfo,
            ipAddress,
            tenantId
        });

        const context = getContext(req);
        const claims = await claimsEngine.resolveClaims({
            userId: user.id,
            sessionId: session.sessionId,
            context
        });

        const payload = {
            sub: user.id,
            email: getUserEmail(user),
            sid: session.sessionId,
            claims,
            tenant: tenantId
        };
        const accessToken = tokenEngine.generateAccessToken(payload);

        events.emit(events.EVENTS.LOGIN_SUCCESS, { userId: user.id, sessionId: session.sessionId });

        return res.json({
            accessToken,
            refreshToken: rawRefreshToken,
            sessionId: session.sessionId,
            expiresIn: tokenEngine.ACCESS_EXPIRY
        });
    } catch (err) {
        console.error('Login Logic Error:', err);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
};

module.exports = function createRouter(options = {}) {
    const { externalAuthResolver } = options;
    const router = express.Router();
    const requireVerifiedEmail = process.env.EMAIL_VERIFICATION_REQUIRED === 'true';

    // --- Register ---
    router.post('/register', async (req, res) => {
        try {
            const validated = parseRequestBody(registerSchema, req, res);
            if (!validated) return;

            const { email, identifier, password, metadata } = validated;
            const resolvedIdentifier = resolveIdentifier({ email, identifier });

            if (!resolvedIdentifier || !password) {
                return res.status(400).json({ error: 'Valid email and password are required' });
            }

            const user = await identityEngine.createUser({ identifier: resolvedIdentifier, password, metadata });
            events.emit('registrationSuccess', { userId: user.id });

            const verificationRequest = await emailVerificationEngine.requestEmailVerificationForUser(user);
            if (verificationRequest) {
                events.emit(events.EVENTS.EMAIL_VERIFICATION_REQUESTED, verificationRequest);
            }

            return res.status(201).json({ message: 'User registered successfully', userId: user.id });
        } catch (err) {
            if (err.message === 'IDENTIFIER_IN_USE') {
                return res.status(409).json({ error: 'Identifier already exists' });
            }
            if (err.message === 'INVALID_PASSWORD_POLICY') {
                return res.status(400).json({ error: 'Password does not meet minimum policy requirements' });
            }
            res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    // --- Login ---
    router.post('/login', async (req, res) => {
        try {
            const validated = parseRequestBody(loginSchema, req, res);
            if (!validated) return;

            const { email, identifier, password } = validated;
            const resolvedIdentifier = resolveIdentifier({ email, identifier });

            if (!resolvedIdentifier || !password) {
                return res.status(400).json({ error: 'Valid email and password are required' });
            }

            const lockoutKey = getLoginAttemptKey(req, resolvedIdentifier);
            const lockoutState = consumeLoginLockout(lockoutKey);
            if (lockoutState.locked) {
                return res.status(429).json({
                    error: 'ACCOUNT_TEMPORARILY_LOCKED',
                    retryAfterSeconds: lockoutState.retryAfterSeconds
                });
            }

            const user = await identityEngine.findUserByIdentifier(resolvedIdentifier);

            if (!user) {
                recordLoginFailure(lockoutKey);
                events.emit(events.EVENTS.LOGIN_FAILURE, { identifier: resolvedIdentifier, reason: 'USER_NOT_FOUND' });
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const isValid = await identityEngine.verifyPassword(user, password);
            if (!isValid) {
                recordLoginFailure(lockoutKey);
                events.emit(events.EVENTS.LOGIN_FAILURE, { userId: user.id, reason: 'INVALID_PASSWORD' });
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            if (requireVerifiedEmail && !emailVerificationEngine.isUserEmailVerified(user)) {
                return res.status(403).json({ error: 'EMAIL_NOT_VERIFIED' });
            }

            clearLoginFailures(lockoutKey);

            await handleLoginSuccess(user, req, res);
        } catch (err) {
            console.error('Login route error:', err);
            res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    // --- External auth (e.g. OAuth/SAML) – universal integration
    if (typeof externalAuthResolver === 'function') {
        router.post('/external', async (req, res) => {
            try {
                const validated = parseRequestBody(externalAuthSchema, req, res);
                if (!validated) return;

                const { provider, token, profile } = validated;

                const result = await externalAuthResolver({ provider, token, profile, req });
                if (!result?.userId) {
                    return res.status(401).json({ error: 'Invalid or expired external token' });
                }

                const user = await identityEngine.findUserById(result.userId);
                if (!user) {
                    return res.status(401).json({ error: 'User not found' });
                }

                await handleLoginSuccess(user, req, res);
            } catch (err) {
                console.error('External auth route error:', err);
                res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
            }
        });
    }

    // --- Refresh ---
    router.post('/refresh', async (req, res) => {
        try {
            const validated = parseRequestBody(refreshSchema, req, res);
            if (!validated) return;

            const { refreshToken, sessionId } = validated;

            const { session, newRawRefreshToken } = await sessionEngine.rotateRefreshToken(sessionId, refreshToken);

            const user = await identityEngine.findUserById(session.userId);
            if (!user || (user.is_active === false && user.is_active !== undefined)) {
                await sessionEngine.revokeSession(sessionId);
                return res.status(403).json({ error: 'USER_DISABLED' });
            }

            const context = getContext(req);
            const claims = await claimsEngine.resolveClaims({
                userId: user.id,
                sessionId: session.sessionId,
                context
            });

            const tenant = session.tenantId ?? context.tenant;
            const payload = {
                sub: user.id,
                email: getUserEmail(user),
                sid: session.sessionId,
                claims,
                tenant
            };
            const newAccessToken = tokenEngine.generateAccessToken(payload);

            return res.json({
                accessToken: newAccessToken,
                refreshToken: newRawRefreshToken,
                sessionId: session.sessionId
            });
        } catch (err) {
            return res.status(401).json({ error: err.message });
        }
    });

    // --- Logout ---
    router.post('/logout', async (req, res) => {
        try {
            const validated = parseRequestBody(logoutSchema, req, res);
            if (!validated) return;

            const { sessionId } = validated;

            await sessionEngine.revokeSession(sessionId);
            return res.json({ message: 'Session revoked successfully' });
        } catch (err) {
            console.error('Logout route error:', err);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    // --- Forgot password ---
    router.post('/forgot-password', async (req, res) => {
        try {
            const validated = parseRequestBody(forgotPasswordSchema, req, res);
            if (!validated) return;

            const { email, identifier } = validated;
            const resolvedIdentifier = resolveIdentifier({ email, identifier });

            if (!resolvedIdentifier) {
                return res.status(400).json({ error: 'Valid email is required' });
            }

            const result = await passwordResetEngine.requestPasswordReset(resolvedIdentifier);

            // Always return 200 to avoid leaking whether the user exists
            if (result) {
                events.emit(events.EVENTS.PASSWORD_RESET_REQUESTED, {
                    userId: result.userId,
                    identifier: result.identifier,
                    rawToken: result.rawToken,
                    expiresAt: result.expiresAt
                });
            }

            return res.json({
                message: 'If an account exists for this identifier, a reset link has been sent.'
            });
        } catch (err) {
            console.error('Forgot password route error:', err);
            res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    // --- Reset password (with token from email link) ---
    router.post('/reset-password', async (req, res) => {
        try {
            const validated = parseRequestBody(resetPasswordSchema, req, res);
            if (!validated) return;

            const { token, newPassword } = validated;

            identityEngine.validatePasswordPolicy(newPassword);

            await passwordResetEngine.resetPasswordWithToken(token, newPassword);
            events.emit(events.EVENTS.PASSWORD_RESET_COMPLETED, {});

            return res.json({ message: 'Password has been reset successfully' });
        } catch (err) {
            if (err.message === 'INVALID_OR_EXPIRED_RESET_TOKEN') {
                return res.status(400).json({ error: err.message });
            }
            if (err.message === 'INVALID_PASSWORD_POLICY') {
                return res.status(400).json({ error: 'Password does not meet minimum policy requirements' });
            }
            res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    // --- Resend email verification ---
    router.post('/resend-verification', async (req, res) => {
        try {
            const validated = parseRequestBody(resendVerificationSchema, req, res);
            if (!validated) return;

            const resolvedIdentifier = resolveIdentifier(validated);
            if (!resolvedIdentifier) {
                return res.status(400).json({ error: 'Valid email is required' });
            }

            const verificationRequest = await emailVerificationEngine.requestEmailVerificationByIdentifier(resolvedIdentifier);
            if (verificationRequest) {
                events.emit(events.EVENTS.EMAIL_VERIFICATION_REQUESTED, verificationRequest);
            }

            return res.json({
                message: 'If this account exists and is unverified, a verification email has been sent.'
            });
        } catch (err) {
            console.error('Resend verification route error:', err);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    // --- Verify email ---
    router.post('/verify-email', async (req, res) => {
        try {
            const validated = parseRequestBody(verifyEmailSchema, req, res);
            if (!validated) return;

            const result = await emailVerificationEngine.verifyEmailWithToken(validated.token);
            events.emit(events.EVENTS.EMAIL_VERIFICATION_COMPLETED, result);

            return res.json({ message: 'Email verified successfully' });
        } catch (err) {
            if (err.message === 'INVALID_OR_EXPIRED_VERIFY_TOKEN') {
                return res.status(400).json({ error: err.message });
            }
            console.error('Verify email route error:', err);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    return router;
};
