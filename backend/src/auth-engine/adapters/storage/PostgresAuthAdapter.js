const { randomUUID } = require('node:crypto');
const { pool } = require('../../../config/db');

class PostgresAuthAdapter {
    async createUser(identifier, passwordHash, metadata = {}) {
        const id = `user_${randomUUID()}`;
        const meta = typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {});
        
        try {
            const res = await pool.query(
                `INSERT INTO users (id, identifier, password_hash, metadata) VALUES ($1, $2, $3, $4) RETURNING *`,
                [id, identifier, passwordHash, meta]
            );
            return res.rows[0];
        } catch (error) {
            if (error.code === '23505') throw new Error('User already exists');
            throw error;
        }
    }

    async findUserByIdentifier(identifier) {
        const res = await pool.query(
            `SELECT * FROM users WHERE identifier = $1 
             OR metadata->>'email' = $1 
             OR metadata->>'phone' = $1 LIMIT 1`,
            [identifier]
        );
        return res.rows[0] || null;
    }

    async findUserById(id) {
        const res = await pool.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [id]);
        return res.rows[0] || null;
    }

    async updatePassword(userId, newPasswordHash) {
        const res = await pool.query(
            `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
            [newPasswordHash, userId]
        );
        if (res.rowCount === 0) throw new Error('User not found');
        return true;
    }

    async createSession({ sessionId, userId, refreshTokenHash, tenantId, expiresAt }) {
        const res = await pool.query(
            `INSERT INTO sessions (session_id, user_id, refresh_token_hash, tenant_id, expires_at)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [sessionId, userId, refreshTokenHash, tenantId || null, expiresAt]
        );
        const row = res.rows[0];
        return row ? { sessionId: row.session_id, userId: row.user_id, refreshTokenHash: row.refresh_token_hash, tenantId: row.tenant_id, expiresAt: row.expires_at } : null;
    }

    async findSession(sessionId) {
        const res = await pool.query(`SELECT * FROM sessions WHERE session_id = $1 LIMIT 1`, [sessionId]);
        if (res.rowCount === 0) return null;
        const row = res.rows[0];
        return { sessionId: row.session_id, userId: row.user_id, refreshTokenHash: row.refresh_token_hash, tenantId: row.tenant_id, expiresAt: row.expires_at, revoked: row.revoked };
    }

    async updateSessionToken(sessionId, newRefreshTokenHash, expiresAt) {
        const res = await pool.query(
            `UPDATE sessions SET refresh_token_hash = $1, expires_at = $2 WHERE session_id = $3 RETURNING session_id`,
            [newRefreshTokenHash, expiresAt, sessionId]
        );
        if (res.rowCount === 0) throw new Error('Session not found');
        return true;
    }

    async revokeSession(sessionId) {
        const res = await pool.query(`UPDATE sessions SET revoked = true WHERE session_id = $1 RETURNING session_id`, [sessionId]);
        if (res.rowCount === 0) throw new Error('Session not found');
        return true;
    }

    async deleteExpiredSessions() {
        const res = await pool.query(`DELETE FROM sessions WHERE expires_at < NOW()`);
        return res.rowCount;
    }

    async createPasswordResetToken(userId, tokenHash, expiresAt) {
        const id = `reset_${randomUUID()}`;
        await pool.query(
            `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
            [id, userId, tokenHash, expiresAt]
        );
        return { id, userId, tokenHash, expiresAt };
    }

    async findAndConsumePasswordResetToken(tokenHash) {
        const res = await pool.query(
            `UPDATE password_reset_tokens SET used_at = NOW() 
             WHERE token_hash = $1 AND expires_at > NOW() AND used_at IS NULL
             RETURNING user_id`,
            [tokenHash]
        );
        if (res.rowCount === 0) return null;
        return { userId: res.rows[0].user_id };
    }

    async createEmailVerificationToken(userId, tokenHash, expiresAt) {
        const id = `verify_${randomUUID()}`;
        await pool.query(
            `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
            [id, userId, tokenHash, expiresAt]
        );
        return { id, userId, tokenHash, expiresAt };
    }

    async findAndConsumeEmailVerificationToken(tokenHash) {
        const res = await pool.query(
            `UPDATE email_verification_tokens SET used_at = NOW(), updated_at = NOW()
             WHERE token_hash = $1 AND expires_at > NOW() AND used_at IS NULL
             RETURNING user_id`,
            [tokenHash]
        );
        if (res.rowCount === 0) return null;
        return { userId: res.rows[0].user_id };
    }

    async markEmailVerified(userId) {
        const res = await pool.query(
            `UPDATE users SET email_verified = true, email_verified_at = NOW(), updated_at = NOW()
             WHERE id = $1 RETURNING id`,
            [userId]
        );
        if (res.rowCount === 0) throw new Error('User not found');
        return true;
    }
}

module.exports = PostgresAuthAdapter;
