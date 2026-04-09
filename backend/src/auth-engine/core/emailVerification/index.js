const identityEngine = require('../identity');
const tokenEngine = require('../token');

let storageAdapter = null;
let VERIFY_TOKEN_EXPIRY_MS = 30 * 60 * 1000;

const __init__ = (injectedAdapter, ttlMinutes) => {
    if (!injectedAdapter) throw new Error('Storage adapter is required');
    storageAdapter = injectedAdapter;

    const parsedTtl = Number.parseInt(ttlMinutes, 10);
    if (Number.isFinite(parsedTtl) && parsedTtl > 0) {
        VERIFY_TOKEN_EXPIRY_MS = parsedTtl * 60 * 1000;
    }
};

const isUserEmailVerified = (user) => {
    if (user?.email_verified === true || user?.email_verified === 1) return true;
    if (user?.email_verified_at) return true;

    const metadata = user?.metadata;
    if (!metadata) return false;

    try {
        const parsed = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
        return parsed?.emailVerified === true;
    } catch {
        return false;
    }
};

const issueTokenForUser = async (user) => {
    if (!storageAdapter) throw new Error('Email verification layer not initialized');
    if (!user?.id) throw new Error('USER_NOT_FOUND');

    const rawToken = tokenEngine.generateOtpToken();
    const tokenHash = tokenEngine.hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + VERIFY_TOKEN_EXPIRY_MS);

    await storageAdapter.createEmailVerificationToken(user.id, tokenHash, expiresAt);

    return {
        userId: user.id,
        identifier: user.identifier,
        rawToken,
        expiresAt
    };
};

const issueTokenHashAndExpiry = () => {
    const rawToken = tokenEngine.generateOtpToken();
    const tokenHash = tokenEngine.hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + VERIFY_TOKEN_EXPIRY_MS);
    return { rawToken, tokenHash, expiresAt };
};

const requestPendingRegistrationVerification = async ({ identifier, password, metadata = {} }) => {
    if (!storageAdapter) throw new Error('Email verification layer not initialized');
    if (typeof storageAdapter.createPendingRegistration !== 'function') {
        throw new TypeError('PENDING_REGISTRATION_NOT_SUPPORTED');
    }

    const existingUser = await identityEngine.findUserByIdentifier(identifier);
    if (existingUser) {
        throw new Error('IDENTIFIER_IN_USE');
    }

    identityEngine.validatePasswordPolicy(password);
    const passwordHash = await identityEngine.hashPassword(password);
    const { rawToken, tokenHash, expiresAt } = issueTokenHashAndExpiry();

    await storageAdapter.createPendingRegistration({
        identifier,
        passwordHash,
        metadata,
        tokenHash,
        expiresAt
    });

    return {
        userId: null,
        identifier,
        rawToken,
        expiresAt
    };
};

const requestEmailVerificationByIdentifier = async (identifier) => {
    if (!storageAdapter) throw new Error('Email verification layer not initialized');

    const user = await identityEngine.findUserByIdentifier(identifier);
    if (user) {
        if (isUserEmailVerified(user)) return null;
        return issueTokenForUser(user);
    }

    if (typeof storageAdapter.findPendingRegistrationByIdentifier !== 'function' || typeof storageAdapter.rotatePendingRegistrationToken !== 'function') {
        return null;
    }

    const pending = await storageAdapter.findPendingRegistrationByIdentifier(identifier);
    if (!pending) return null;

    const { rawToken, tokenHash, expiresAt } = issueTokenHashAndExpiry();
    await storageAdapter.rotatePendingRegistrationToken(identifier, tokenHash, expiresAt);

    return {
        userId: null,
        identifier,
        rawToken,
        expiresAt
    };
};

const requestEmailVerificationForUser = async (user) => {
    if (!user) return null;
    if (isUserEmailVerified(user)) return null;
    return issueTokenForUser(user);
};

const verifyEmailWithToken = async (rawToken) => {
    if (!storageAdapter) throw new Error('Email verification layer not initialized');

    const tokenHash = tokenEngine.hashResetToken(rawToken);
    const record = await storageAdapter.findAndConsumeEmailVerificationToken(tokenHash);
    if (record) {
        await storageAdapter.markEmailVerified(record.userId);
        return { userId: record.userId };
    }

    if (typeof storageAdapter.findAndConsumePendingRegistration !== 'function') {
        throw new TypeError('INVALID_OR_EXPIRED_VERIFY_TOKEN');
    }

    const pending = await storageAdapter.findAndConsumePendingRegistration(tokenHash);
    if (!pending) throw new Error('INVALID_OR_EXPIRED_VERIFY_TOKEN');

    let parsedMetadata = pending.metadata || {};
    if (typeof pending.metadata === 'string') {
        try {
            parsedMetadata = JSON.parse(pending.metadata || '{}');
        } catch {
            parsedMetadata = {};
        }
    }

    try {
        const createdUser = await storageAdapter.createUser(pending.identifier, pending.password_hash, parsedMetadata);
        await storageAdapter.markEmailVerified(createdUser.id);
        return { userId: createdUser.id };
    } catch (error) {
        const existingUser = await identityEngine.findUserByIdentifier(pending.identifier);
        if (existingUser) {
            await storageAdapter.markEmailVerified(existingUser.id);
            return { userId: existingUser.id };
        }
        throw error;
    }
};

module.exports = {
    __init__,
    requestPendingRegistrationVerification,
    requestEmailVerificationByIdentifier,
    requestEmailVerificationForUser,
    verifyEmailWithToken,
    isUserEmailVerified
};
