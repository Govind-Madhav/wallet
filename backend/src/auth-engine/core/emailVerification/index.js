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

const requestEmailVerificationByIdentifier = async (identifier) => {
    if (!storageAdapter) throw new Error('Email verification layer not initialized');

    const user = await identityEngine.findUserByIdentifier(identifier);
    if (!user) return null;
    if (isUserEmailVerified(user)) return null;

    return issueTokenForUser(user);
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
    if (!record) throw new Error('INVALID_OR_EXPIRED_VERIFY_TOKEN');

    await storageAdapter.markEmailVerified(record.userId);

    return { userId: record.userId };
};

module.exports = {
    __init__,
    requestEmailVerificationByIdentifier,
    requestEmailVerificationForUser,
    verifyEmailWithToken,
    isUserEmailVerified
};
