const { runInTransaction, query } = require('../../../config/db');

class PostgresWalletAdapter {
    async reserveReference(client, referenceId, transactionKind) {
        const res = await client.query(
            `INSERT INTO transaction_refs (reference_id, transaction_kind)
             VALUES ($1, $2)
             ON CONFLICT (reference_id) DO NOTHING
             RETURNING reference_id`,
            [referenceId, transactionKind]
        );
        return res.rowCount === 1;
    }

    async ensureAccount(client, accountId) {
        await client.query(
            `INSERT INTO accounts (id, owner_name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [accountId, `Account-${String(accountId).substring(0, 8)}`]
        );
    }

    async findLedgerByReference(client, referenceId) {
        const res = await client.query(
            `SELECT * FROM ledger WHERE reference_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [referenceId]
        );
        return res.rows[0] || null;
    }

    async findTransferByReference(client, referenceId) {
        const res = await client.query(
            `SELECT * FROM ledger WHERE reference_id IN ($1, $2) ORDER BY created_at ASC`,
            [`${referenceId}_out`, `${referenceId}_in`]
        );
        return res.rows;
    }

    async getBalance(accountId) {
        const res = await query(
            `SELECT COALESCE(SUM(amount), 0) as balance FROM ledger WHERE account_id = $1`,
            [accountId]
        );
        return Number.parseFloat(res.rows[0].balance);
    }

    async executeDeposit(accountId, amount, referenceId) {
        return await runInTransaction(async (client) => {
            await this.ensureAccount(client, accountId);
            const reserved = await this.reserveReference(client, referenceId, 'DEPOSIT');
            if (!reserved) {
                const existing = await this.findLedgerByReference(client, referenceId);
                if (existing) return existing;
                throw new Error('REFERENCE_ID_ALREADY_USED');
            }

            const res = await client.query(
                `INSERT INTO ledger (account_id, amount, transaction_type, reference_id)
                 VALUES ($1, $2, 'DEPOSIT', $3) RETURNING *`,
                [accountId, amount, referenceId]
            );
            return res.rows[0];
        });
    }

    async executeWithdraw(accountId, amount, referenceId) {
        return await runInTransaction(async (client) => {
            await this.ensureAccount(client, accountId);
            const reserved = await this.reserveReference(client, referenceId, 'WITHDRAWAL');
            if (!reserved) {
                const existing = await this.findLedgerByReference(client, referenceId);
                if (existing) return existing;
                throw new Error('REFERENCE_ID_ALREADY_USED');
            }

            await client.query(
                `SELECT id FROM accounts WHERE id = $1 FOR NO KEY UPDATE`,
                [accountId]
            );

            const balanceRes = await client.query(
                `SELECT COALESCE(SUM(amount), 0) as balance FROM ledger WHERE account_id = $1`,
                [accountId]
            );
            const currentBalance = Number.parseFloat(balanceRes.rows[0].balance);

            if (currentBalance < amount) {
                throw new Error(`Insufficient funds. Available: ${currentBalance}, Required: ${amount}`);
            }

            const res = await client.query(
                `INSERT INTO ledger (account_id, amount, transaction_type, reference_id)
                 VALUES ($1, $2, 'WITHDRAWAL', $3) RETURNING *`,
                [accountId, -amount, referenceId]
            );

            return res.rows[0];
        });
    }

    async executeTransfer(fromAccountId, toAccountId, amount, referenceId) {
        return await runInTransaction(async (client) => {
            await this.ensureAccount(client, fromAccountId);
            await this.ensureAccount(client, toAccountId);
            const reserved = await this.reserveReference(client, referenceId, 'TRANSFER');
            if (!reserved) {
                const existing = await this.findTransferByReference(client, referenceId);
                if (existing.length === 2) return existing;
                throw new Error('REFERENCE_ID_ALREADY_USED');
            }

            const accountsToLock = [fromAccountId, toAccountId].sort((a, b) => String(a).localeCompare(String(b)));
            
            for (const acc of accountsToLock) {
                await client.query(`SELECT id FROM accounts WHERE id = $1 FOR NO KEY UPDATE`, [acc]);
            }

            const balanceRes = await client.query(
                `SELECT COALESCE(SUM(amount), 0) as balance FROM ledger WHERE account_id = $1`,
                [fromAccountId]
            );
            if (Number.parseFloat(balanceRes.rows[0].balance) < amount) {
                throw new Error('Insufficient funds for transfer');
            }

            const debit = await client.query(
                `INSERT INTO ledger (account_id, amount, transaction_type, reference_id)
                 VALUES ($1, $2, 'TRANSFER_OUT', $3) RETURNING *`,
                [fromAccountId, -amount, `${referenceId}_out`]
            );

            const credit = await client.query(
                `INSERT INTO ledger (account_id, amount, transaction_type, reference_id)
                 VALUES ($1, $2, 'TRANSFER_IN', $3) RETURNING *`,
                [toAccountId, amount, `${referenceId}_in`]
            );

            return [debit.rows[0], credit.rows[0]];
        });
    }
}

module.exports = PostgresWalletAdapter;
