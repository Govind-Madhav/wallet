const express = require('express');
const { z } = require('zod');

const accountIdSchema = z.string().trim().min(1).max(64);

const transferSchema = z.object({
    toAccountId: accountIdSchema.optional(),
    toEmail: z.email().trim().max(255).optional(),
    amount: z.unknown(),
    referenceId: z.string().trim().min(1).max(255)
});

const depositSchema = z.object({
    accountId: accountIdSchema.optional(),
    amount: z.unknown(),
    referenceId: z.string().trim().min(1).max(255)
});

const withdrawSchema = z.object({
    accountId: accountIdSchema.optional(),
    amount: z.unknown(),
    referenceId: z.string().trim().min(1).max(255)
});

const parseBody = (schema, req, res) => {
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
        res.status(400).json({
            error: 'INVALID_REQUEST_BODY',
            details: z.treeifyError(parsed.error)
        });
        return null;
    }
    return parsed.data;
};

const parsePositiveAmount = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
};

const normalizeAccountId = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Canonicalize auth IDs like user_<uuid> to raw UUID for wallet persistence.
    const match = /^user_([0-9a-fA-F-]{36})$/.exec(trimmed);
    if (match) return match[1];

    return trimmed;
};

const normalizeLedgerReference = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    return trimmed.replace(/_(out|in)$/u, '');
};

function createWalletRouter(walletCore, options = {}) {
    const { resolveRecipientAccountId, resolveAccountDisplayDetails } = options;
    const router = express.Router();

    router.get('/balance', async (req, res) => {
        try {
            // Strictly enforce isolation: only use the authenticated user's claim
            const accountId = normalizeAccountId(req.claims?.accountId);
            if (!accountId) return res.status(403).json({ error: 'Unauthorized: Missing account identifier' });
            
            const balance = await walletCore.getBalance(accountId);
            res.json({ balance });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/recent-transactions', async (req, res) => {
        try {
            const accountId = normalizeAccountId(req.claims?.accountId);
            if (!accountId) return res.status(403).json({ error: 'Unauthorized: Missing account identifier' });

            const limitValue = Number.parseInt(req.query.limit, 10);
            const transactions = await walletCore.getRecentTransactions(accountId, limitValue);

            const enrichedTransactions = await Promise.all(transactions.map(async (transaction) => {
                const baseReference = normalizeLedgerReference(transaction?.reference_id);
                const counterpartyAccountId = transaction?.transaction_type?.startsWith('TRANSFER') && baseReference
                    ? await walletCore.adapter.getTransferCounterpartyAccountId(transaction.reference_id, accountId)
                    : null;
                let counterparty = null;
                let directionLabel = null;

                if (transaction.transaction_type === 'TRANSFER_OUT') {
                    directionLabel = 'Sent to';
                } else if (transaction.transaction_type === 'TRANSFER_IN') {
                    directionLabel = 'Received from';
                }

                if (counterpartyAccountId && typeof resolveAccountDisplayDetails === 'function') {
                    counterparty = await resolveAccountDisplayDetails(counterpartyAccountId);
                }

                return {
                    ...transaction,
                    counterpartyAccountId,
                    counterpartyLabel: counterparty?.label || null,
                    counterpartyEmail: counterparty?.email || null,
                    directionLabel
                };
            }));

            res.json({ transactions: enrichedTransactions });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/transfer', async (req, res) => {
        try {
            const validated = parseBody(transferSchema, req, res);
            if (!validated) return;

            // Strictly enforce fromAccountId matches the authenticated user
            const fromAccountId = normalizeAccountId(req.claims?.accountId);
            if (!fromAccountId) return res.status(403).json({ error: 'Unauthorized: Missing account identifier' });
            let toAccountId = normalizeAccountId(validated.toAccountId);
            const { toEmail, amount, referenceId } = validated;
            const parsedAmount = parsePositiveAmount(amount);

            if (!toAccountId && toEmail) {
                if (typeof resolveRecipientAccountId !== 'function') {
                    return res.status(500).json({ error: 'Recipient resolver not configured' });
                }

                const resolved = await resolveRecipientAccountId(toEmail);
                toAccountId = normalizeAccountId(resolved);
            }

            if (!fromAccountId || !toAccountId || !parsedAmount || !referenceId) {
                return res.status(400).json({ error: 'Missing required fields. Provide toAccountId or toEmail.' });
            }

            const result = await walletCore.transfer(fromAccountId, toAccountId, parsedAmount, referenceId);
            res.json({ success: true, result });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    router.post('/deposit', async (req, res) => {
        try {
            const validated = parseBody(depositSchema, req, res);
            if (!validated) return;

            // Strictly enforce deposit to the authenticated user's account
            const accountId = normalizeAccountId(req.claims?.accountId);
            if (!accountId) return res.status(403).json({ error: 'Unauthorized: Missing account identifier' });
            const { amount, referenceId } = validated;
            const parsedAmount = parsePositiveAmount(amount);

            if (!accountId || !parsedAmount || !referenceId) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const result = await walletCore.deposit(accountId, parsedAmount, referenceId);
            res.json({ success: true, result });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    router.post('/withdraw', async (req, res) => {
        try {
            const validated = parseBody(withdrawSchema, req, res);
            if (!validated) return;

            // Strictly enforce withdraw from the authenticated user's account
            const accountId = normalizeAccountId(req.claims?.accountId);
            if (!accountId) return res.status(403).json({ error: 'Unauthorized: Missing account identifier' });
            const { amount, referenceId } = validated;
            const parsedAmount = parsePositiveAmount(amount);

            if (!accountId || !parsedAmount || !referenceId) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const result = await walletCore.withdraw(accountId, parsedAmount, referenceId);
            res.json({ success: true, result });
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    return router;
}

module.exports = createWalletRouter;
