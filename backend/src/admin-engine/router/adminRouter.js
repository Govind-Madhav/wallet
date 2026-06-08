const express = require('express');

const parsePositiveInteger = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return parsed;
};

const parseMetadata = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;

    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
};

const normalizeRoleSet = (metadata) => {
    const roles = new Set(['user']);

    if (Array.isArray(metadata.roles)) {
        metadata.roles.forEach((role) => {
            if (typeof role === 'string' && role.trim()) {
                roles.add(role.trim().toLowerCase());
            }
        });
    }

    if (typeof metadata.role === 'string' && metadata.role.trim()) {
        roles.add(metadata.role.trim().toLowerCase());
    }

    if (metadata.isAdmin === true) {
        roles.add('admin');
    }

    return [...roles];
};

module.exports = function createAdminRouter(options = {}) {
    const router = express.Router();
    const query = options.query;
    const walletCore = options.walletCore;
    const maxPageSize = Number.isFinite(Number(options.maxPageSize)) ? Number(options.maxPageSize) : 200;

    if (typeof query !== 'function') {
        throw new TypeError('Admin router requires a query function');
    }

    if (!walletCore) {
        throw new TypeError('Admin router requires walletCore');
    }

    const getPagination = (req) => {
        const limit = Math.max(1, Math.min(parsePositiveInteger(req.query.limit, 50), maxPageSize));
        const offset = Math.max(0, parsePositiveInteger(req.query.offset, 0));
        return { limit, offset };
    };

    router.get('/overview', async (req, res) => {
        try {
            const [usersResult, activeSessionsResult, accountsResult, ledgerResult, withdrawalsResult, transactionsResult] = await Promise.all([
                query('SELECT COUNT(*) AS total_users FROM users'),
                query('SELECT COUNT(*) AS active_sessions FROM sessions WHERE revoked = 0 AND expires_at > NOW()'),
                query(`SELECT COUNT(*) AS total_accounts
                       FROM accounts a
                       INNER JOIN users u ON u.id = CONCAT('user_', a.id)
                       WHERE u.identifier IS NOT NULL`),
                query('SELECT COUNT(*) AS ledger_entries, COALESCE(SUM(amount), 0) AS net_amount, COALESCE(SUM(ABS(amount)), 0) AS absolute_amount FROM ledger'),
                query('SELECT COUNT(*) AS total_withdrawals, SUM(CASE WHEN status = "WAITING_ADMIN" THEN 1 ELSE 0 END) AS waiting_admin FROM withdrawals'),
                query('SELECT COUNT(*) AS total_transactions FROM transactions')
            ]);
            const escrow = await walletCore.getEscrowSummary();

            return res.json({
                generatedAt: new Date().toISOString(),
                totals: {
                    users: Number(usersResult.rows[0]?.total_users || 0),
                    activeSessions: Number(activeSessionsResult.rows[0]?.active_sessions || 0),
                    accounts: Number(accountsResult.rows[0]?.total_accounts || 0),
                    ledgerEntries: Number(ledgerResult.rows[0]?.ledger_entries || 0),
                    netAmount: Number(ledgerResult.rows[0]?.net_amount || 0),
                    absoluteAmount: Number(ledgerResult.rows[0]?.absolute_amount || 0),
                    withdrawals: Number(withdrawalsResult.rows[0]?.total_withdrawals || 0),
                    waitingAdmin: Number(withdrawalsResult.rows[0]?.waiting_admin || 0),
                    transactions: Number(transactionsResult.rows[0]?.total_transactions || 0),
                    escrowAccountId: escrow.accountId,
                    escrowOwnerName: escrow.ownerName,
                    escrowBalance: escrow.balance,
                    escrowIsDummy: escrow.isDummy
                }
            });
        } catch (error) {
            console.error('[Admin Overview Error]', error);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    router.get('/users', async (req, res) => {
        try {
            const { limit, offset } = getPagination(req);
            const rows = await query(
                `SELECT id, identifier, email_verified, email_verified_at, metadata, created_at, updated_at
                 FROM users
                 ORDER BY created_at DESC
                 LIMIT ? OFFSET ?`,
                [limit, offset]
            );

            const users = rows.rows.map((user) => {
                const metadata = parseMetadata(user.metadata);
                return {
                    id: user.id,
                    identifier: user.identifier,
                    emailVerified: Boolean(user.email_verified),
                    emailVerifiedAt: user.email_verified_at,
                    createdAt: user.created_at,
                    updatedAt: user.updated_at,
                    roles: normalizeRoleSet(metadata),
                    metadata
                };
            });

            return res.json({ users, pagination: { limit, offset } });
        } catch (error) {
            console.error('[Admin Users Error]', error);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    router.get('/sessions', async (req, res) => {
        try {
            const { limit, offset } = getPagination(req);
            const rows = await query(
                `SELECT s.session_id, s.user_id, s.tenant_id, s.expires_at, s.revoked, s.created_at, u.identifier
                 FROM sessions s
                 LEFT JOIN users u ON u.id = s.user_id
                 ORDER BY s.created_at DESC
                 LIMIT ? OFFSET ?`,
                [limit, offset]
            );

            const sessions = rows.rows.map((session) => ({
                sessionId: session.session_id,
                userId: session.user_id,
                identifier: session.identifier,
                tenantId: session.tenant_id,
                expiresAt: session.expires_at,
                revoked: Boolean(session.revoked),
                createdAt: session.created_at
            }));

            return res.json({ sessions, pagination: { limit, offset } });
        } catch (error) {
            console.error('[Admin Sessions Error]', error);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    router.get('/accounts', async (req, res) => {
        try {
            const { limit, offset } = getPagination(req);
            const rows = await query(
                `SELECT a.id, a.owner_name, a.created_at,
                        COALESCE(SUM(l.amount), 0) AS balance,
                        COUNT(l.id) AS ledger_entries,
                        MAX(l.created_at) AS last_activity_at,
                        u.identifier
                 FROM accounts a
                 INNER JOIN users u ON u.id = CONCAT('user_', a.id)
                 LEFT JOIN ledger l ON l.account_id = a.id
                 WHERE u.identifier IS NOT NULL
                 GROUP BY a.id, a.owner_name, a.created_at, u.identifier
                 ORDER BY a.created_at DESC
                 LIMIT ? OFFSET ?`,
                [limit, offset]
            );

            const accounts = rows.rows.map((account) => ({
                accountId: account.id,
                ownerName: account.owner_name,
                identifier: account.identifier || null,
                createdAt: account.created_at,
                balance: Number(account.balance || 0),
                ledgerEntries: Number(account.ledger_entries || 0),
                lastActivityAt: account.last_activity_at
            }));

            return res.json({ accounts, pagination: { limit, offset } });
        } catch (error) {
            console.error('[Admin Accounts Error]', error);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    router.get('/ledger', async (req, res) => {
        try {
            const { limit, offset } = getPagination(req);
            const rows = await query(
                `SELECT l.id, l.account_id, l.amount, l.transaction_type, l.reference_id, l.created_at,
                        u.identifier
                 FROM ledger l
                 LEFT JOIN users u ON u.id = CONCAT('user_', l.account_id)
                 ORDER BY l.created_at DESC, l.id DESC
                 LIMIT ? OFFSET ?`,
                [limit, offset]
            );

            const ledger = rows.rows.map((entry) => ({
                id: Number(entry.id),
                accountId: entry.account_id,
                identifier: entry.identifier || null,
                amount: Number(entry.amount || 0),
                transactionType: entry.transaction_type,
                referenceId: entry.reference_id,
                createdAt: entry.created_at
            }));

            return res.json({ ledger, pagination: { limit, offset } });
        } catch (error) {
            console.error('[Admin Ledger Error]', error);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    router.get('/withdrawals', async (req, res) => {
        try {
            const { limit, offset } = getPagination(req);
            const status = typeof req.query.status === 'string' ? req.query.status : undefined;
            const withdrawals = await walletCore.getWithdrawalsForAdmin({ limit, offset, status });
            return res.json({ withdrawals, pagination: { limit, offset } });
        } catch (error) {
            console.error('[Admin Withdrawals Error]', error);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    router.get('/support-tickets', async (req, res) => {
        try {
            const { limit, offset } = getPagination(req);
            const status = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : '';
            const params = [];
            let where = '';

            if (status) {
                where = 'WHERE s.status = ?';
                params.push(status);
            }

            const rows = await query(
                `SELECT s.*, u.identifier
                 FROM support_tickets s
                 LEFT JOIN users u ON u.id = s.user_id
                 ${where}
                 ORDER BY s.created_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const tickets = rows.rows.map((ticket) => ({
                id: Number(ticket.id),
                userId: ticket.user_id,
                identifier: ticket.identifier || null,
                subject: ticket.subject,
                description: ticket.description,
                status: ticket.status,
                createdAt: ticket.created_at,
                resolvedAt: ticket.resolved_at
            }));

            return res.json({ tickets, pagination: { limit, offset } });
        } catch (error) {
            console.error('[Admin Support Tickets Error]', error);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    router.post('/support-tickets/:ticketId/resolve', async (req, res) => {
        try {
            const ticketId = Number.parseInt(req.params.ticketId, 10);
            if (!Number.isFinite(ticketId) || ticketId <= 0) {
                return res.status(400).json({ error: 'INVALID_TICKET_ID' });
            }

            const result = await query(
                `UPDATE support_tickets SET status = 'RESOLVED', resolved_at = NOW() WHERE id = ?`,
                [ticketId]
            );

            if (!result.rowCount) {
                return res.status(404).json({ error: 'TICKET_NOT_FOUND' });
            }

            return res.json({ success: true, ticketId, status: 'RESOLVED' });
        } catch (error) {
            console.error('[Admin Support Tickets Resolve Error]', error);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    router.post('/withdrawals/:withdrawalId/approve', async (req, res) => {
        try {
            const withdrawalId = Number.parseInt(req.params.withdrawalId, 10);
            if (!Number.isFinite(withdrawalId) || withdrawalId <= 0) {
                return res.status(400).json({ error: 'INVALID_WITHDRAWAL_ID' });
            }

            const force = Boolean(req.body?.force);
            const roles = Array.isArray(req.claims?.roles) ? req.claims.roles : [];
            const isSuperAdmin = roles.includes('super_admin');

            if (force && !isSuperAdmin) {
                return res.status(403).json({ error: 'FORCE_APPROVE_REQUIRES_SUPER_ADMIN' });
            }

            const result = await walletCore.approveWithdrawal(withdrawalId, {
                adminId: req.identity?.id,
                force
            });

            return res.json({ success: true, withdrawal: result });
        } catch (error) {
            if (error.message === 'WITHDRAWAL_NOT_FOUND') {
                return res.status(404).json({ error: error.message });
            }
            if (error.message === 'WITHDRAWAL_ALREADY_FINALIZED') {
                return res.status(409).json({ error: error.message });
            }

            console.error('[Admin Approve Withdrawal Error]', error);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    router.post('/withdrawals/:withdrawalId/reject', async (req, res) => {
        try {
            const withdrawalId = Number.parseInt(req.params.withdrawalId, 10);
            if (!Number.isFinite(withdrawalId) || withdrawalId <= 0) {
                return res.status(400).json({ error: 'INVALID_WITHDRAWAL_ID' });
            }

            const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : null;
            const result = await walletCore.rejectWithdrawal(withdrawalId, {
                adminId: req.identity?.id,
                reason
            });

            return res.json({ success: true, withdrawal: result });
        } catch (error) {
            if (error.message === 'WITHDRAWAL_NOT_FOUND') {
                return res.status(404).json({ error: error.message });
            }
            if (error.message === 'WITHDRAWAL_ALREADY_FINALIZED') {
                return res.status(409).json({ error: error.message });
            }

            console.error('[Admin Reject Withdrawal Error]', error);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    router.post('/withdrawals/process-queue', async (req, res) => {
        try {
            const limit = Number.parseInt(req.body?.limit, 10);
            const force = Boolean(req.body?.force);
            const processed = await walletCore.adapter.processPendingWithdrawals({
                limit: Number.isFinite(limit) ? limit : 25,
                adminId: req.identity?.id || 'system',
                force
            });

            return res.json({ success: true, processedCount: processed.length, withdrawals: processed });
        } catch (error) {
            console.error('[Admin Withdrawal Queue Error]', error);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    router.get('/admin-logs', async (req, res) => {
        try {
            const { limit, offset } = getPagination(req);
            const logs = await walletCore.getAdminLogs(limit, offset);
            return res.json({ logs, pagination: { limit, offset } });
        } catch (error) {
            console.error('[Admin Logs Error]', error);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    });

    return router;
};
