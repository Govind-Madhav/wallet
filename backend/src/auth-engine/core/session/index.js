const { v4: uuidv4 } = require('uuid');
const tokenEngine = require('../token');
const events = require('../events');

let storageAdapter = null;
let REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days default

const __init__ = (injectedAdapter, expiryStringOrMs) => {
    if (!injectedAdapter) throw new Error("Storage adapter is required");
    storageAdapter = injectedAdapter;

    if (expiryStringOrMs) {
        // Just basic support for ms if passed a number, or we handle string duration ideally.
        // Assuming ms for simplicity in this implementation, real world would use `ms` library.
        REFRESH_EXPIRY_MS = parseInt(expiryStringOrMs) || REFRESH_EXPIRY_MS;
    }
};

const createSession = async ({ userId, deviceInfo = {}, ipAddress = null, tenantId = null }) => {
    if (!storageAdapter) throw new Error("Session layer not initialized");

    const sessionId = uuidv4();
    const rawRefreshToken = tokenEngine.generateRefreshToken();
    const refreshTokenHash = tokenEngine.hashRefreshToken(rawRefreshToken);

    const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

    const sessionData = {
        sessionId,
        userId,
        refreshTokenHash,
        deviceInfo,
        ipAddress,
        tenantId,
        expiresAt
    };

    const session = await storageAdapter.createSession(sessionData);

    events.emit(events.EVENTS.SESSION_CREATED, { sessionId, userId, tenantId });

    return { session, rawRefreshToken };
};

const validateSession = async (sessionId, rawRefreshToken) => {
    if (!storageAdapter) throw new Error("Session layer not initialized");

    const session = await storageAdapter.findSession(sessionId);

    if (!session) throw new Error("SESSION_NOT_FOUND");
    if (session.revoked) throw new Error("SESSION_REVOKED");
    if (session.expiresAt < new Date()) throw new Error("SESSION_EXPIRED");

    const expectedHash = tokenEngine.hashRefreshToken(rawRefreshToken);
    if (session.refreshTokenHash !== expectedHash) {
        throw new Error("INVALID_REFRESH_TOKEN");
    }

    return session;
};

// Important Token Rotation (anti-replay) logic
const rotateRefreshToken = async (sessionId, oldRawRefreshToken) => {
    // 1. Validate the old token first
    const session = await validateSession(sessionId, oldRawRefreshToken);

    // 2. Generate new token
    const newRawRefreshToken = tokenEngine.generateRefreshToken();
    const newRefreshTokenHash = tokenEngine.hashRefreshToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

    // 3. Update in DB (invalidates the old hash immediately)
    await storageAdapter.updateSessionToken(sessionId, newRefreshTokenHash, newExpiresAt);

    events.emit(events.EVENTS.TOKEN_REFRESHED, { sessionId, userId: session.userId });

    return { session, newRawRefreshToken };
};

const revokeSession = async (sessionId) => {
    if (!storageAdapter) throw new Error("Session layer not initialized");

    const session = await storageAdapter.findSession(sessionId);
    if (!session || session.revoked) return true; // Already gone/revoked

    await storageAdapter.revokeSession(sessionId);

    events.emit(events.EVENTS.SESSION_REVOKED, { sessionId, userId: session.userId });

    return true;
};

module.exports = {
    __init__,
    createSession,
    validateSession,
    rotateRefreshToken,
    revokeSession
};
