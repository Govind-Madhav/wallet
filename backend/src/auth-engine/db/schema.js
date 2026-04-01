const { sqliteTable, text, integer } = require('drizzle-orm/sqlite-core');

// Define the users table
const users = sqliteTable('users', {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull().unique(), // Can be email, username, phone, etc.
    password_hash: text('password_hash').notNull(),
    is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    metadata: text('metadata', { mode: 'json' }).default('{}'),
    created_at: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
    updated_at: integer('updated_at', { mode: 'timestamp' }).notNull().default(new Date()),
});

// Define the sessions table
const sessions = sqliteTable('sessions', {
    sessionId: text('session_id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    tenantId: text('tenant_id'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    revoked: integer('revoked', { mode: 'boolean' }).notNull().default(false),
    created_at: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
});

// Password reset tokens (single-use, short-lived)
const passwordResetTokens = sqliteTable('password_reset_tokens', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    usedAt: integer('used_at', { mode: 'timestamp' }),
    created_at: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
});

module.exports = {
    users,
    sessions,
    passwordResetTokens
};
