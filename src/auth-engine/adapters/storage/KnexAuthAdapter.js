const { randomUUID } = require('node:crypto');

class KnexAuthAdapter {
    constructor(knexInstance) {
        this.db = knexInstance;
    }

    async initSchema() {
        const hasUsers = await this.db.schema.hasTable('users');
        if (!hasUsers) {
            await this.db.schema.createTable('users', (t) => {
                t.string('id', 50).primary();
                t.string('identifier', 255).unique().notNullable();
                t.string('password_hash', 255).notNullable();
                t.json('metadata');
                t.timestamps(true, true);
            });
            console.log('Auth Engine: Created `users` table via Knex Abstract Builder');
        }

        const hasSessions = await this.db.schema.hasTable('sessions');
        if (!hasSessions) {
            await this.db.schema.createTable('sessions', (t) => {
                t.string('session_id', 255).primary();
                t.string('user_id', 50).notNullable();
                t.string('refresh_token_hash', 255).notNullable();
                t.string('tenant_id', 50);
                t.timestamp('expires_at').notNullable();
                t.boolean('revoked').defaultTo(false);
                t.timestamps(true, true);
            });
            console.log('Auth Engine: Created `sessions` table via Knex Abstract Builder');
        }

        const hasResetTokens = await this.db.schema.hasTable('password_reset_tokens');
        if (!hasResetTokens) {
            await this.db.schema.createTable('password_reset_tokens', (t) => {
                t.string('id', 50).primary();
                t.string('user_id', 50).notNullable();
                t.string('token_hash', 255).notNullable();
                t.timestamp('expires_at').notNullable();
                t.timestamp('used_at');
                t.timestamps(true, true);
            });
            console.log('Auth Engine: Created `password_reset_tokens` table via Knex Abstract Builder');
        }
        return true;
    }

    async createUser(identifier, passwordHash, metadata = {}) {
        const id = `user_${randomUUID()}`;
        const meta = typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {});
        try {
            await this.db('users').insert({
                id,
                identifier,
                password_hash: passwordHash,
                metadata: meta
            });
            const user = await this.db('users').where({ id }).first();
            return user;
        } catch (error) {
            if (error.code === '23505' || error.code === 'ER_DUP_ENTRY' || error.message.includes('UNIQUE')) {
                throw new Error('User already exists');
            }
            throw error;
        }
    }

    async findUserByIdentifier(identifier) {
        const user = await this.db('users').where({ identifier }).first();
        return user || null;
    }

    async findUserById(id) {
        const user = await this.db('users').where({ id }).first();
        return user || null;
    }

    async updatePassword(userId, newPasswordHash) {
        const updated = await this.db('users').where({ id: userId }).update({
            password_hash: newPasswordHash,
            updated_at: this.db.fn.now()
        });
        if (!updated) throw new Error('User not found');
        return true;
    }

    async createSession({ sessionId, userId, refreshTokenHash, tenantId, expiresAt }) {
        await this.db('sessions').insert({
            session_id: sessionId,
            user_id: userId,
            refresh_token_hash: refreshTokenHash,
            tenant_id: tenantId || null,
            expires_at: expiresAt
        });
        const session = await this.db('sessions').where({ session_id: sessionId }).first();
        return session ? {
            sessionId: session.session_id,
            userId: session.user_id,
            refreshTokenHash: session.refresh_token_hash,
            tenantId: session.tenant_id,
            expiresAt: session.expires_at
        } : null;
    }

    async findSession(sessionId) {
        const session = await this.db('sessions').where({ session_id: sessionId }).first();
        return session ? {
            sessionId: session.session_id,
            userId: session.user_id,
            refreshTokenHash: session.refresh_token_hash,
            tenantId: session.tenant_id,
            expiresAt: session.expires_at,
            revoked: session.revoked
        } : null;
    }

    async updateSessionToken(sessionId, newRefreshTokenHash, expiresAt) {
        const updated = await this.db('sessions').where({ session_id: sessionId }).update({
            refresh_token_hash: newRefreshTokenHash,
            expires_at: expiresAt,
            updated_at: this.db.fn.now()
        });
        if (!updated) throw new Error('Session not found');
        return true;
    }

    async revokeSession(sessionId) {
        const updated = await this.db('sessions').where({ session_id: sessionId }).update({
            revoked: true,
            updated_at: this.db.fn.now()
        });
        if (!updated) throw new Error('Session not found');
        return true;
    }

    async deleteExpiredSessions() {
        return await this.db('sessions').where('expires_at', '<', this.db.fn.now()).del();
    }

    async createPasswordResetToken(userId, tokenHash, expiresAt) {
        const id = `reset_${randomUUID()}`;
        await this.db('password_reset_tokens').insert({
            id,
            user_id: userId,
            token_hash: tokenHash,
            expires_at: expiresAt
        });
        return { id, userId, tokenHash, expiresAt };
    }

    async findAndConsumePasswordResetToken(tokenHash) {
        return await this.db.transaction(async (trx) => {
            const token = await trx('password_reset_tokens')
                .where({ token_hash: tokenHash })
                .andWhere('expires_at', '>', trx.fn.now())
                .whereNull('used_at')
                .first();
            
            if (!token) return null;

            await trx('password_reset_tokens')
                .where({ id: token.id })
                .update({ used_at: trx.fn.now(), updated_at: trx.fn.now() });

            return { userId: token.user_id };
        });
    }
}

module.exports = KnexAuthAdapter;
