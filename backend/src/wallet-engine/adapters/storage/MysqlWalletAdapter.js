const { runInTransaction, query } = require('../../../config/db');

class MysqlWalletAdapter {
    async reserveReference(client, referenceId, transactionKind) {
        const [res] = await client.execute(
            `INSERT IGNORE INTO transaction_refs (reference_id, transaction_kind)
             VALUES (?, ?)`,
            [referenceId, transactionKind]
        );
        return res.affectedRows === 1;
    }

    async ensureAccount(client, accountId) {
        await client.execute(
            `INSERT IGNORE INTO accounts (id, owner_name) VALUES (?, ?)`,
            [accountId, `Account-${String(accountId).substring(0, 8)}`]
        );
    }

    async findLedgerByReference(client, referenceId) {
        const [rows] = await client.execute(
            `SELECT * FROM ledger WHERE reference_id = ? ORDER BY created_at DESC LIMIT 1`,
            [referenceId]
        );
        return rows[0] || null;
    }

    async findTransferByReference(client, referenceId) {
        const [rows] = await client.execute(
            `SELECT * FROM ledger WHERE reference_id IN (?, ?) ORDER BY created_at ASC`,
            [`${referenceId}_out`, `${referenceId}_in`]
        );
        return rows;
    }

    async getBalance(accountId) {
        const res = await query(
            `SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger WHERE account_id = ?`,
            [accountId]
        );
        return Number.parseFloat(res.rows[0]?.balance || 0);
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

            const [res] = await client.execute(
                `INSERT INTO ledger (account_id, amount, transaction_type, reference_id)
                 VALUES (?, ?, 'DEPOSIT', ?)`,
                [accountId, amount, referenceId]
            );

            const [rows] = await client.execute(`SELECT * FROM ledger WHERE id = ? LIMIT 1`, [res.insertId]);
            return rows[0];
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

            await client.execute(
                `SELECT id FROM accounts WHERE id = ? FOR UPDATE`,
                [accountId]
            );

            const [balanceRows] = await client.execute(
                `SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger WHERE account_id = ?`,
                [accountId]
            );
            const currentBalance = Number.parseFloat(balanceRows[0].balance);

            if (currentBalance < amount) {
                throw new Error(`Insufficient funds. Available: ${currentBalance}, Required: ${amount}`);
            }

            const [res] = await client.execute(
                `INSERT INTO ledger (account_id, amount, transaction_type, reference_id)
                 VALUES (?, ?, 'WITHDRAWAL', ?)`,
                [accountId, -amount, referenceId]
            );

            const [rows] = await client.execute(`SELECT * FROM ledger WHERE id = ? LIMIT 1`, [res.insertId]);
            return rows[0];
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
                await client.execute(`SELECT id FROM accounts WHERE id = ? FOR UPDATE`, [acc]);
            }

            const [balanceRows] = await client.execute(
                `SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger WHERE account_id = ?`,
                [fromAccountId]
            );
            if (Number.parseFloat(balanceRows[0].balance) < amount) {
                throw new Error('Insufficient funds for transfer');
            }

            const [debitRes] = await client.execute(
                `INSERT INTO ledger (account_id, amount, transaction_type, reference_id)
                 VALUES (?, ?, 'TRANSFER_OUT', ?)`,
                [fromAccountId, -amount, `${referenceId}_out`]
            );

            const [creditRes] = await client.execute(
                `INSERT INTO ledger (account_id, amount, transaction_type, reference_id)
                 VALUES (?, ?, 'TRANSFER_IN', ?)`,
                [toAccountId, amount, `${referenceId}_in`]
            );

            const [debitRows] = await client.execute(`SELECT * FROM ledger WHERE id = ? LIMIT 1`, [debitRes.insertId]);
            const [creditRows] = await client.execute(`SELECT * FROM ledger WHERE id = ? LIMIT 1`, [creditRes.insertId]);

            return [debitRows[0], creditRows[0]];
        });
    }
}

module.exports = MysqlWalletAdapter;
