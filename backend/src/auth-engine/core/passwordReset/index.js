const identityEngine = require('../identity');
const tokenEngine = require('../token');

let storageAdapter = null;

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

const __init__ = (injectedAdapter) => {
    if (!injectedAdapter) throw new Error('Storage adapter is required');
    storageAdapter = injectedAdapter;
};

/**
 * Request a password reset for an identifier (email/username/phone).
 * Returns { rawToken, expiresAt } if user exists; host should send email via onPasswordResetRequested.
 * Returns null if user not found (no leak).
 */
const requestPasswordReset = async (identifier) => {
    if (!storageAdapter) throw new Error('Password reset layer not initialized');

    const user = await identityEngine.findUserByIdentifier(identifier);
    if (!user) return null;

    const rawToken = tokenEngine.generateResetToken();
    const tokenHash = tokenEngine.hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

    await storageAdapter.createPasswordResetToken(user.id, tokenHash, expiresAt);

    return {
        userId: user.id,
        rawToken,
        expiresAt,
        identifier: user.identifier
    };
};

/**
 * Reset password using a valid reset token. Consumes the token (single-use).
 * Returns true on success.
 */
const resetPasswordWithToken = async (rawToken, newPassword) => {
    if (!storageAdapter) throw new Error('Password reset layer not initialized');

    const tokenHash = tokenEngine.hashResetToken(rawToken);
    const record = await storageAdapter.findAndConsumePasswordResetToken(tokenHash);
    if (!record) throw new Error('INVALID_OR_EXPIRED_RESET_TOKEN');

    const newPasswordHash = await identityEngine.hashPassword(newPassword);
    await storageAdapter.updatePassword(record.userId, newPasswordHash);

    return true;
};

module.exports = {
    __init__,
    requestPasswordReset,
    resetPasswordWithToken
};
