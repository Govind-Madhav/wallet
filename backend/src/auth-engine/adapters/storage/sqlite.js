const { db } = require('../../db');
const { users, sessions, passwordResetTokens } = require('../../db/schema');
const { eq, lt, or, sql, and } = require('drizzle-orm');
const { randomUUID } = require('node:crypto');

class SqliteStorageAdapter {

    // IDENTITY CONTRACT //

    async createUser(identifier, passwordHash, metadata = {}) {
        const id = `user_${randomUUID()}`;

        try {
            const meta = typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {});
            const newUser = await db.insert(users).values({
                id,
                identifier,
                password_hash: passwordHash,
                metadata: meta
            }).returning();

            return {
                ...newUser[0],
                metadata: typeof newUser[0].metadata === 'string' ? JSON.parse(newUser[0].metadata) : newUser[0].metadata
            };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                throw new Error('User already exists');
            }
            throw error;
        }
    }

    async findUserByIdentifier(identifier) {
        // Universal search: check the primary identifier column OR the metadata JSON for email/phone
        const user = await db.select().from(users).where(
            or(
                eq(users.identifier, identifier),
                sql`json_extract(${users.metadata}, '$.email') = ${identifier}`,
                sql`json_extract(${users.metadata}, '$.phone') = ${identifier}`
            )
        ).limit(1);

        if (user.length === 0) return null;

        return {
            ...user[0],
            metadata: typeof user[0].metadata === 'string' ? JSON.parse(user[0].metadata) : user[0].metadata
        };
    }

    async findUserById(id) {
        const user = await db.select().from(users).where(eq(users.id, id)).limit(1);
        if (user.length === 0) return null;

        return {
            ...user[0],
            metadata: typeof user[0].metadata === 'string' ? JSON.parse(user[0].metadata) : user[0].metadata
        };
    }

    async updatePassword(userId, newPasswordHash) {
        const result = await db.update(users)
            .set({ password_hash: newPasswordHash, updated_at: new Date() })
            .where(eq(users.id, userId))
            .returning({ updatedId: users.id });

        if (result.length === 0) throw new Error('User not found');
        return true;
    }

    // SESSION CONTRACT //

    async createSession({ sessionId, userId, refreshTokenHash, tenantId, expiresAt }) {
        const newSession = await db.insert(sessions).values({
            sessionId,
            userId,
            refreshTokenHash,
            tenantId: tenantId || null,
            expiresAt
        }).returning();

        const row = newSession[0];
        return row ? { ...row, tenantId: row.tenantId ?? null } : null;
    }

    async findSession(sessionId) {
        const session = await db.select().from(sessions).where(eq(sessions.sessionId, sessionId)).limit(1);
        if (session.length === 0) return null;
        const row = session[0];
        return { ...row, tenantId: row.tenantId ?? null };
    }

    async updateSessionToken(sessionId, newRefreshTokenHash, expiresAt) {
        const result = await db.update(sessions)
            .set({ refreshTokenHash: newRefreshTokenHash, expiresAt })
            .where(eq(sessions.sessionId, sessionId))
            .returning({ updatedId: sessions.sessionId });

        if (result.length === 0) throw new Error('Session not found');
        return true;
    }

    async revokeSession(sessionId) {
        const result = await db.update(sessions)
            .set({ revoked: true })
            .where(eq(sessions.sessionId, sessionId))
            .returning({ updatedId: sessions.sessionId });

        if (result.length === 0) throw new Error('Session not found');
        return true;
    }

    async deleteExpiredSessions() {
        const now = new Date();
        const deleted = await db.delete(sessions)
            .where(lt(sessions.expiresAt, now))
            .returning();
        return deleted.length;
    }

    // PASSWORD RESET CONTRACT (optional – adapters can no-op if not supported)

    async createPasswordResetToken(userId, tokenHash, expiresAt) {
        const id = `reset_${randomUUID()}`;
        await db.insert(passwordResetTokens).values({
            id,
            userId,
            tokenHash,
            expiresAt
        });
        return { id, userId, tokenHash, expiresAt };
    }

    async findAndConsumePasswordResetToken(tokenHash) {
        const now = new Date();
        const rows = await db.select().from(passwordResetTokens).where(
            and(
                eq(passwordResetTokens.tokenHash, tokenHash),
                lt(now, passwordResetTokens.expiresAt),
                sql`${passwordResetTokens.usedAt} IS NULL`
            )
        ).limit(1);

        if (rows.length === 0) return null;
        const row = rows[0];
        await db.update(passwordResetTokens)
            .set({ usedAt: now })
            .where(eq(passwordResetTokens.id, row.id));
        return { userId: row.userId };
    }

    async createEmailVerificationToken(userId, tokenHash, expiresAt) {
        // SQLite adapter stores verification status directly in user metadata for lightweight mode.
        const user = await this.findUserById(userId);
        if (!user) throw new Error('User not found');

        const metadata = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {});
        metadata.pendingEmailVerification = {
            tokenHash,
            expiresAt: new Date(expiresAt).toISOString(),
            usedAt: null
        };

        await db.update(users)
            .set({ metadata: JSON.stringify(metadata), updated_at: new Date() })
            .where(eq(users.id, userId));

        return { id: `verify_${randomUUID()}`, userId, tokenHash, expiresAt };
    }

    async findAndConsumeEmailVerificationToken(tokenHash) {
        const allUsers = await db.select().from(users);
        const now = new Date();

        for (const user of allUsers) {
            const metadata = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {});
            const pending = metadata.pendingEmailVerification;
            if (!pending) continue;
            if (pending.tokenHash !== tokenHash) continue;
            if (pending.usedAt) return null;
            if (new Date(pending.expiresAt) <= now) return null;

            pending.usedAt = now.toISOString();
            metadata.pendingEmailVerification = pending;

            await db.update(users)
                .set({ metadata: JSON.stringify(metadata), updated_at: now })
                .where(eq(users.id, user.id));

            return { userId: user.id };
        }

        return null;
    }

    async markEmailVerified(userId) {
        const user = await this.findUserById(userId);
        if (!user) throw new Error('User not found');

        const metadata = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : (user.metadata || {});
        metadata.emailVerified = true;
        delete metadata.pendingEmailVerification;

        await db.update(users)
            .set({ metadata: JSON.stringify(metadata), updated_at: new Date() })
            .where(eq(users.id, userId));

        return true;
    }
}

module.exports = SqliteStorageAdapter;
