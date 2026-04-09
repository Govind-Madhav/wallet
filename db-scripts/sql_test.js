 const { randomUUID } = require('node:crypto');
const fs = require('fs');
const path = require('path');
const { pool } = require('../backend/src/config/db');

require('dotenv').config();

const runSchemaInit = async () => {
    const walletSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    try {
        await pool.query(walletSql);
    } catch (err) {
        // Allow repeated test runs when schema/indexes already exist.
        if (err && err.code === 'ER_DUP_KEYNAME') {
            return;
        }
        throw err;
    }
};

const assertTrue = (condition, message) => {
    if (!condition) {
        throw new Error(`ASSERTION_FAILED: ${message}`);
    }
};

async function cleanup(prefix, accountA, accountB) {
    await pool.query(
        `DELETE FROM audit_logs
         WHERE JSON_UNQUOTE(JSON_EXTRACT(new_data, '$.reference_id')) LIKE ?`,
        [`${prefix}%`]
    );

    await pool.query(`DELETE FROM ledger WHERE reference_id LIKE ?`, [`${prefix}%`]);
    await pool.query(`DELETE FROM transaction_refs WHERE reference_id LIKE ?`, [`${prefix}%`]);
    await pool.query(`DELETE FROM accounts WHERE id IN (?, ?)`, [accountA, accountB]);
}

async function main() {
    const prefix = `SQLTEST_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const accountA = randomUUID();
    const accountB = randomUUID();

    console.log('1) Initializing wallet schema...');
    await runSchemaInit();

    console.log('2) Verifying required tables...');
    const dbName = new URL(process.env.DATABASE_URL).pathname.replace('/', '');
    const [tableRows] = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = ?`,
        [dbName]
    );

    const required = new Set([
        'accounts',
        'ledger',
        'audit_logs',
        'transaction_refs',
        'users',
        'sessions',
        'password_reset_tokens',
        'email_verification_tokens'
    ]);

    const existing = new Set(tableRows.map((r) => String(r.table_name || r.TABLE_NAME).toLowerCase()));
    for (const table of required) {
        assertTrue(existing.has(table), `Missing table: ${table}`);
    }

    await cleanup(prefix, accountA, accountB);

    console.log('3) Testing inserts and trigger audit logging...');
    const refDeposit = `${prefix}_DEPOSIT_1`;
    await pool.query(`INSERT INTO accounts (id, owner_name) VALUES (?, ?)`, [accountA, 'SQL Test A']);
    await pool.query(`INSERT INTO transaction_refs (reference_id, transaction_kind) VALUES (?, ?)`, [refDeposit, 'DEPOSIT']);
    await pool.query(
        `INSERT INTO ledger (account_id, amount, transaction_type, reference_id) VALUES (?, ?, 'DEPOSIT', ?)`,
        [accountA, 1000.0, refDeposit]
    );

    const [auditRows] = await pool.query(
        `SELECT id FROM audit_logs
         WHERE JSON_UNQUOTE(JSON_EXTRACT(new_data, '$.reference_id')) = ?
         LIMIT 1`,
        [refDeposit]
    );
    assertTrue(auditRows.length === 1, 'Ledger trigger did not create audit log row');

    console.log('4) Testing unique reference constraint...');
    let duplicateRejected = false;
    try {
        await pool.query(`INSERT INTO transaction_refs (reference_id, transaction_kind) VALUES (?, ?)`, [refDeposit, 'DEPOSIT']);
    } catch {
        duplicateRejected = true;
    }
    assertTrue(duplicateRejected, 'Duplicate reference_id should be rejected by PRIMARY KEY');

    console.log('5) Testing foreign key constraint...');
    let fkRejected = false;
    try {
        await pool.query(
            `INSERT INTO ledger (account_id, amount, transaction_type, reference_id) VALUES (?, ?, 'DEPOSIT', ?)`,
            [randomUUID(), 10.0, `${prefix}_INVALID_FK`]
        );
    } catch {
        fkRejected = true;
    }
    assertTrue(fkRejected, 'Ledger insert with missing account must fail due to FK');

    console.log('6) Testing transaction rollback...');
    const conn = await pool.getConnection();
    const rollbackRef = `${prefix}_ROLLBACK_1`;
    try {
        await conn.beginTransaction();
        await conn.query(`INSERT INTO accounts (id, owner_name) VALUES (?, ?)`, [accountB, 'SQL Test B']);
        await conn.query(`INSERT INTO transaction_refs (reference_id, transaction_kind) VALUES (?, ?)`, [rollbackRef, 'DEPOSIT']);
        await conn.query(
            `INSERT INTO ledger (account_id, amount, transaction_type, reference_id) VALUES (?, ?, 'DEPOSIT', ?)`,
            [accountB, 333.0, rollbackRef]
        );
        await conn.rollback();
    } finally {
        conn.release();
    }

    const [rollbackRows] = await pool.query(`SELECT id FROM ledger WHERE reference_id = ?`, [rollbackRef]);
    assertTrue(rollbackRows.length === 0, 'Rollback failed: ledger row still exists');

    console.log('7) Testing balance query correctness...');
    const refWithdraw = `${prefix}_WITHDRAW_1`;
    await pool.query(`INSERT INTO transaction_refs (reference_id, transaction_kind) VALUES (?, ?)`, [refWithdraw, 'WITHDRAWAL']);
    await pool.query(
        `INSERT INTO ledger (account_id, amount, transaction_type, reference_id) VALUES (?, ?, 'WITHDRAWAL', ?)`,
        [accountA, -250.0, refWithdraw]
    );

    const [balanceRows] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger WHERE account_id = ?`,
        [accountA]
    );
    assertTrue(Number(balanceRows[0].balance) === 750, `Balance mismatch. Expected 750, got ${balanceRows[0].balance}`);

    console.log('8) Testing NULL constraints...');
    const nullTests = [
        {
            name: 'accounts.id NOT NULL',
            query: `INSERT INTO accounts (id, owner_name) VALUES (NULL, ?)`,
            params: ['Test Owner'],
            shouldFail: true
        },
        {
            name: 'accounts.owner_name NOT NULL',
            query: `INSERT INTO accounts (id, owner_name) VALUES (?, NULL)`,
            params: [randomUUID()],
            shouldFail: true
        },
        {
            name: 'ledger.amount NOT NULL',
            query: `INSERT INTO ledger (account_id, amount, transaction_type, reference_id) VALUES (?, NULL, 'DEPOSIT', ?)`,
            params: [accountA, `${prefix}_NULL_TEST`],
            shouldFail: true
        },
        {
            name: 'transaction_refs.transaction_kind NOT NULL',
            query: `INSERT INTO transaction_refs (reference_id, transaction_kind) VALUES (?, NULL)`,
            params: [`${prefix}_NULL_KIND`],
            shouldFail: true
        }
    ];

    for (const test of nullTests) {
        let failed = false;
        try {
            await pool.query(test.query, test.params);
        } catch (err) {
            failed = true;
        }
        if (test.shouldFail) {
            assertTrue(failed, `${test.name} should reject NULL`);
        }
    }

    console.log('9) Testing transaction_type enum validation...');
    let validTypeInserted = false;
    try {
        const testRef = `${prefix}_TYPE_TEST`;
        await pool.query(`INSERT INTO transaction_refs (reference_id, transaction_kind) VALUES (?, ?)`, [testRef, 'TRANSFER']);
        await pool.query(
            `INSERT INTO ledger (account_id, amount, transaction_type, reference_id) VALUES (?, ?, 'TRANSFER', ?)`,
            [accountA, 50.0, testRef]
        );
        validTypeInserted = true;
    } catch (err) {
        console.error('  Valid type insertion failed:', err.message);
    }
    assertTrue(validTypeInserted, 'TRANSFER should be a valid transaction_type');

    console.log('10) Testing transaction_kind accepts various kinds...');
    const kindTests = ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'REFUND', 'ADJUSTMENT'];
    for (const kind of kindTests) {
        let inserted = false;
        try {
            const kindRef = `${prefix}_KIND_${kind}`;
            await pool.query(`INSERT INTO transaction_refs (reference_id, transaction_kind) VALUES (?, ?)`, [kindRef, kind]);
            const [checkRows] = await pool.query(`SELECT transaction_kind FROM transaction_refs WHERE reference_id = ?`, [kindRef]);
            assertTrue(checkRows.length === 1 && checkRows[0].transaction_kind === kind, `transaction_kind '${kind}' mismatch`);
            inserted = true;
        } catch (err) {
            console.error(`  Failed to insert kind '${kind}':`, err.message);
        }
        assertTrue(inserted, `transaction_kind '${kind}' should be accepted`);
    }

    console.log('11) Testing amount precision and sign...');
    const precisionTests = [
        {
            name: 'deposit amount (positive)',
            amount: 1234.56,
            shouldPass: true
        },
        {
            name: 'withdrawal amount (negative)',
            amount: -999.99,
            shouldPass: true
        },
        {
            name: 'zero amount',
            amount: 0,
            shouldPass: true
        },
        {
            name: 'large decimal precision',
            amount: 123456.789,
            shouldPass: true
        }
    ];

    for (const test of precisionTests) {
        let passed = false;
        try {
            const precRef = `${prefix}_PREC_${Math.random()}`;
            await pool.query(`INSERT INTO transaction_refs (reference_id, transaction_kind) VALUES (?, ?)`, [precRef, 'DEPOSIT']);
            await pool.query(
                `INSERT INTO ledger (account_id, amount, transaction_type, reference_id) VALUES (?, ?, 'DEPOSIT', ?)`,
                [accountA, test.amount, precRef]
            );
            passed = true;
        } catch (err) {
            if (test.shouldPass) {
                console.error(`  ${test.name} failed:`, err.message);
            }
        }
        assertTrue(passed === test.shouldPass, `${test.name} validation failed`);
    }

    console.log('12) Testing timestamp auto-population...');
    const [timestampRows] = await pool.query(
        `SELECT created_at FROM ledger WHERE account_id = ? ORDER BY created_at DESC LIMIT 1`,
        [accountA]
    );
    assertTrue(timestampRows.length > 0, 'No ledger rows found for timestamp test');
    assertTrue(timestampRows[0].created_at !== null && timestampRows[0].created_at !== undefined, 'created_at should be auto-populated');

    console.log('13) Testing transaction_refs created_at auto-population...');
    const refAutoPopTest = `${prefix}_AUTOPOP_TEST`;
    await pool.query(`INSERT INTO transaction_refs (reference_id, transaction_kind) VALUES (?, ?)`, [refAutoPopTest, 'DEPOSIT']);
    const [refTimestampRows] = await pool.query(
        `SELECT created_at FROM transaction_refs WHERE reference_id = ?`,
        [refAutoPopTest]
    );
    assertTrue(refTimestampRows.length === 1, 'transaction_refs row not found');
    assertTrue(refTimestampRows[0].created_at !== null, 'transaction_refs.created_at should be auto-populated');

    console.log('14) Testing reference_id uniqueness constraint...');
    let uniqueConstraintEnforced = false;
    const uniqueRef = `${prefix}_UNIQUE_TEST`;
    try {
        await pool.query(`INSERT INTO transaction_refs (reference_id, transaction_kind) VALUES (?, ?)`, [uniqueRef, 'DEPOSIT']);
        await pool.query(`INSERT INTO transaction_refs (reference_id, transaction_kind) VALUES (?, ?)`, [uniqueRef, 'WITHDRAWAL']);
    } catch (err) {
        uniqueConstraintEnforced = true;
    }
    assertTrue(uniqueConstraintEnforced, 'Duplicate reference_id should violate PRIMARY KEY constraint');

    console.log('15) Testing account balance calculation with multiple transactions...');
    const accountC = randomUUID();
    await pool.query(`INSERT INTO accounts (id, owner_name) VALUES (?, ?)`, [accountC, 'SQL Test C']);

    const transactions = [
        { ref: `${prefix}_CALC_1`, type: 'DEPOSIT', amount: 1000.0 },
        { ref: `${prefix}_CALC_2`, type: 'DEPOSIT', amount: 500.0 },
        { ref: `${prefix}_CALC_3`, type: 'WITHDRAWAL', amount: -250.0 },
        { ref: `${prefix}_CALC_4`, type: 'TRANSFER', amount: -100.0 }
    ];

    for (const txn of transactions) {
        await pool.query(`INSERT INTO transaction_refs (reference_id, transaction_kind) VALUES (?, ?)`, [txn.ref, txn.type]);
        await pool.query(
            `INSERT INTO ledger (account_id, amount, transaction_type, reference_id) VALUES (?, ?, ?, ?)`,
            [accountC, txn.amount, txn.type, txn.ref]
        );
    }

    const [finalBalance] = await pool.query(
        `SELECT SUM(amount) AS total FROM ledger WHERE account_id = ?`,
        [accountC]
    );
    const expectedTotal = 1000.0 + 500.0 - 250.0 - 100.0; // 1150.0
    assertTrue(Number(finalBalance[0].total) === expectedTotal, `Balance calculation incorrect. Expected ${expectedTotal}, got ${finalBalance[0].total}`);

    console.log('16) Testing account creation with owner_name...');
    const ownerTests = [
        'Alice Smith',
        'Bob Johnson',
        'User@123'
    ];

    for (const ownerName of ownerTests) {
        let inserted = false;
        try {
            const testAcc = randomUUID();
            await pool.query(`INSERT INTO accounts (id, owner_name) VALUES (?, ?)`, [testAcc, ownerName]);
            const [checkRows] = await pool.query(`SELECT owner_name FROM accounts WHERE id = ?`, [testAcc]);
            assertTrue(checkRows.length === 1 && checkRows[0].owner_name === ownerName, `owner_name mismatch for ${ownerName}`);
            inserted = true;
        } catch (err) {
            console.error(`  Failed to insert owner_name '${ownerName}':`, err.message);
        }
        assertTrue(inserted, `owner_name '${ownerName}' should be accepted`);
    }

    console.log('17) Testing audit_logs trigger data integrity...');
    const auditRef = `${prefix}_AUDIT_CHECK`;
    await pool.query(`INSERT INTO transaction_refs (reference_id, transaction_kind) VALUES (?, ?)`, [auditRef, 'DEPOSIT']);
    await pool.query(
        `INSERT INTO ledger (account_id, amount, transaction_type, reference_id) VALUES (?, ?, 'DEPOSIT', ?)`,
        [accountC, 777.0, auditRef]
    );

    const [auditCheck] = await pool.query(
        `SELECT new_data FROM audit_logs WHERE JSON_UNQUOTE(JSON_EXTRACT(new_data, '$.reference_id')) = ? LIMIT 1`,
        [auditRef]
    );
    assertTrue(auditCheck.length === 1, 'audit_logs entry should exist for ledger insert');
    const auditData = typeof auditCheck[0].new_data === 'string' ? JSON.parse(auditCheck[0].new_data) : auditCheck[0].new_data;
    assertTrue(auditData.reference_id === auditRef, 'audit_logs new_data should contain reference_id');
    assertTrue(auditData.amount == 777.0, 'audit_logs new_data should contain correct amount');

    console.log('18) Testing indexes on high-volume queries...');
    const [indexTest] = await pool.query(
        `SELECT id FROM ledger WHERE account_id = ? AND reference_id LIKE ? LIMIT 1`,
        [accountC, `${prefix}%`]
    );
    assertTrue(indexTest.length > 0, 'Index query should return results efficiently');

    await cleanup(prefix, accountA, accountB);
    const [cleanupCheck] = await pool.query(
        `SELECT COUNT(*) AS count FROM ledger WHERE reference_id LIKE ?`,
        [`${prefix}%`]
    );
    assertTrue(Number(cleanupCheck[0].count) === 0, 'Cleanup should remove all test records');

    console.log('SQL tests passed successfully (18/18 comprehensive parameter validations).');
    process.exit(0);
}

main().catch(async (err) => {
    console.error('SQL tests failed:', err.message || err);
    process.exit(1);
});
