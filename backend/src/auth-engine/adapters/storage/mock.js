// In-memory mock storage adapter matching the exact contract
const { randomUUID } = require('node:crypto');

class MockStorageAdapter {
    constructor() {
        this.users = new Map();
        this.sessions = new Map();
        this.passwordResetTokens = new Map();
        this.emailVerificationTokens = new Map();
    }

    // IDENTITY CONTRACT
    async createUser(identifier, passwordHash, metadata = {}) {
        if (this.users.has(identifier)) throw new Error('User already exists');

        const id = `user_${randomUUID()}`;

        const user = {
            id,
            identifier,
            password_hash: passwordHash,
            email_verified: false,
            email_verified_at: null,
            is_active: true,
            metadata,
            created_at: new Date(),
            updated_at: new Date()
        };

        this.users.set(id, user);
        this.users.set(identifier, user);

        return user;
    }

    async findUserByIdentifier(identifier) {
        const user = this.users.get(identifier);
        return user || null;
    }

    async findUserById(id) {
        const user = this.users.get(id);
        return user || null;
    }

    async updatePassword(userId, newPasswordHash) {
        const user = this.users.get(userId);
        if (!user) throw new Error('User not found');

        user.password_hash = newPasswordHash;
        user.updated_at = new Date();

        this.users.set(user.id, user);
        this.users.set(user.identifier, user);

        return true;
    }

    // SESSION CONTRACT
    async createSession(sessionData) {
        const session = {
            ...sessionData,
            revoked: false,
            created_at: new Date()
        };

        this.sessions.set(session.sessionId, session);
        return session;
    }

    async findSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }

    async updateSessionToken(sessionId, newRefreshTokenHash, expiresAt) {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error('Session not found');

        session.refreshTokenHash = newRefreshTokenHash;
        session.expiresAt = expiresAt;

        this.sessions.set(sessionId, session);
        return true;
    }

    async revokeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error('Session not found');

        session.revoked = true;
        this.sessions.set(sessionId, session);
        return true;
    }

    async deleteExpiredSessions() {
        let count = 0;
        const now = new Date();

        for (const [id, session] of this.sessions.entries()) {
            if (session.expiresAt < now) {
                this.sessions.delete(id);
                count++;
            }
        }

        return count;
    }

    // PASSWORD RESET CONTRACT
    async createPasswordResetToken(userId, tokenHash, expiresAt) {
        const id = `reset_${randomUUID()}`;
        const record = { id, userId, tokenHash, expiresAt, usedAt: null };
        this.passwordResetTokens.set(tokenHash, record);
        return record;
    }

    async findAndConsumePasswordResetToken(tokenHash) {
        const record = this.passwordResetTokens.get(tokenHash);
        if (!record || record.usedAt || record.expiresAt < new Date()) return null;
        record.usedAt = new Date();
        this.passwordResetTokens.set(tokenHash, record);
        return { userId: record.userId };
    }

    async createEmailVerificationToken(userId, tokenHash, expiresAt) {
        const id = `verify_${randomUUID()}`;
        const record = { id, userId, tokenHash, expiresAt, usedAt: null };
        this.emailVerificationTokens.set(tokenHash, record);
        return record;
    }

    async findAndConsumeEmailVerificationToken(tokenHash) {
        const record = this.emailVerificationTokens.get(tokenHash);
        if (!record || record.usedAt || record.expiresAt < new Date()) return null;
        record.usedAt = new Date();
        this.emailVerificationTokens.set(tokenHash, record);
        return { userId: record.userId };
    }

    async markEmailVerified(userId) {
        const user = this.users.get(userId);
        if (!user) throw new Error('User not found');

        user.email_verified = true;
        user.email_verified_at = new Date();
        user.updated_at = new Date();

        this.users.set(user.id, user);
        this.users.set(user.identifier, user);
        return true;
    }
}

module.exports = MockStorageAdapter;
