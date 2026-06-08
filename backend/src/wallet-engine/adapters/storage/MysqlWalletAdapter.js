const crypto = require('node:crypto');
const { runInTransaction, query } = require('../../../config/db');

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 3;

const generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const buildDeviceId = ({ userAgent, ipAddress }) => crypto
    .createHash('sha256')
    .update(`${normalizeText(userAgent)}|${normalizeText(ipAddress)}`)
    .digest('hex')
    .slice(0, 16);

const hashOtp = (otp, salt) => crypto
    .createHash('sha256')
    .update(`${salt}:${String(otp || '')}`)
    .digest('hex');

class MysqlWalletAdapter {
    constructor() {
        this.dailyLimit = Number.parseFloat(process.env.MAX_WITHDRAW_PER_DAY || '25000');
        this.mediumOtp = process.env.WITHDRAW_MEDIUM_OTP || '123456';
        this.dummyEscrowAccountId = process.env.DUMMY_ESCROW_ACCOUNT_ID || 'dummy_escrow_account';
        this.dummyEscrowOwnerName = process.env.DUMMY_ESCROW_OWNER_NAME || 'Dummy Escrow Account';
        const kycSetting = (process.env.REQUIRE_KYC_FOR_WITHDRAWAL || 'true').trim().toLowerCase();
        this.requireKycForWithdrawal = !['false', '0', 'no', 'n', 'off'].includes(kycSetting);
        const forceOtpSetting = (process.env.FORCE_WITHDRAW_OTP || process.env.ALWAYS_REQUIRE_WITHDRAW_OTP || 'false').trim().toLowerCase();
        this.forceWithdrawOtp = ['true', '1', 'yes', 'y', 'on'].includes(forceOtpSetting);
    }

    async ensureColumn(tableName, columnName, definitionSql) {
        const result = await query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [columnName]);
        if (!result.rows.length) {
            await query(`ALTER TABLE ${tableName} ADD COLUMN ${definitionSql}`);
        }
    }

    async ensureSecurityTables() {
        await query(
            `CREATE TABLE IF NOT EXISTS otp_verifications (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id CHAR(36) NOT NULL,
                transaction_id BIGINT UNSIGNED NOT NULL,
                otp_code VARCHAR(255) NOT NULL,
                otp_salt VARCHAR(64) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                verified TINYINT(1) NOT NULL DEFAULT 0,
                attempts INT NOT NULL DEFAULT 0,
                max_attempts INT NOT NULL DEFAULT 3,
                device_id VARCHAR(128),
                ip_address VARCHAR(64),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                verified_at TIMESTAMP NULL,
                UNIQUE KEY uniq_otp_transaction (transaction_id),
                KEY idx_otp_user_created (user_id, created_at),
                KEY idx_otp_expires (expires_at)
            )`
        );

        await query(
            `CREATE TABLE IF NOT EXISTS user_devices (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id CHAR(36) NOT NULL,
                device_id VARCHAR(128) NOT NULL,
                device_info JSON,
                trusted TINYINT(1) NOT NULL DEFAULT 0,
                last_ip_address VARCHAR(64),
                first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_user_device (user_id, device_id),
                KEY idx_user_devices_user (user_id),
                KEY idx_user_devices_trusted (trusted)
            )`
        );

        await query(
            `CREATE TABLE IF NOT EXISTS withdrawal_logs (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id CHAR(36) NOT NULL,
                withdrawal_id BIGINT UNSIGNED NULL,
                transaction_id BIGINT UNSIGNED NULL,
                event_type VARCHAR(50) NOT NULL,
                risk_level VARCHAR(10) NOT NULL DEFAULT 'LOW',
                amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
                ip_address VARCHAR(64),
                device_id VARCHAR(128),
                details JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                KEY idx_withdrawal_logs_user_created (user_id, created_at),
                KEY idx_withdrawal_logs_event_created (event_type, created_at)
            )`
        );

        await query(
            `CREATE TABLE IF NOT EXISTS support_tickets (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id CHAR(36) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP NULL,
                KEY idx_support_tickets_user_created (user_id, created_at),
                KEY idx_support_tickets_status_created (status, created_at)
            )`
        );

        await query(
            `CREATE TABLE IF NOT EXISTS wallet_security_flags (
                user_id CHAR(36) PRIMARY KEY,
                status VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
                reason VARCHAR(255),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`
        );

        await this.ensureColumn('transactions', 'ip_address', "ip_address VARCHAR(64) NULL");
        await this.ensureColumn('transactions', 'device_id', "device_id VARCHAR(128) NULL");
        await this.ensureColumn('transactions', 'otp_required', "otp_required TINYINT(1) NOT NULL DEFAULT 0");
    }

    async initSchema() {
        await this.ensureSecurityTables();

        await query(
            `CREATE TABLE IF NOT EXISTS wallets (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id CHAR(36) NOT NULL,
                balance_cached DECIMAL(15, 2) NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_wallet_user (user_id)
            )`
        );

        await query(
            `CREATE TABLE IF NOT EXISTS transactions (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id CHAR(36) NOT NULL,
                type VARCHAR(50) NOT NULL,
                amount DECIMAL(15, 2) NOT NULL,
                status VARCHAR(20) NOT NULL,
                reference_id VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_transactions_reference (reference_id),
                KEY idx_transactions_user_created (user_id, created_at)
            )`
        );

        await query(
            `CREATE TABLE IF NOT EXISTS withdrawals (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                user_id CHAR(36) NOT NULL,
                amount DECIMAL(15, 2) NOT NULL,
                status VARCHAR(20) NOT NULL,
                risk_level VARCHAR(10) NOT NULL,
                method VARCHAR(20) NOT NULL,
                account_details JSON,
                idempotency_key VARCHAR(255) NOT NULL,
                reference_id VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                processed_at TIMESTAMP NULL,
                UNIQUE KEY uniq_withdrawals_idempotency (idempotency_key),
                UNIQUE KEY uniq_withdrawals_reference (reference_id),
                KEY idx_withdrawals_user_created (user_id, created_at),
                KEY idx_withdrawals_status_created (status, created_at)
            )`
        );

        await query(
            `CREATE TABLE IF NOT EXISTS admins (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL,
                email VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL,
                UNIQUE KEY uniq_admins_email (email)
            )`
        );

        await query(
            `CREATE TABLE IF NOT EXISTS admin_logs (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                admin_id VARCHAR(255) NOT NULL,
                action VARCHAR(100) NOT NULL,
                target_id VARCHAR(255) NOT NULL,
                meta_data JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                KEY idx_admin_logs_created (created_at)
            )`
        );

        await this.ensureDummyEscrowAccount();
    }

    async ensureDummyEscrowAccount() {
        await query(
            `INSERT IGNORE INTO accounts (id, owner_name)
             VALUES (?, ?)`,
            [this.dummyEscrowAccountId, this.dummyEscrowOwnerName]
        );

        await query(
            `INSERT IGNORE INTO wallets (user_id, balance_cached)
             VALUES (?, 0)`,
            [this.dummyEscrowAccountId]
        );
    }

    async getSecurityFlag(client, accountId) {
        const [rows] = await client.execute(
            `SELECT * FROM wallet_security_flags WHERE user_id = ? LIMIT 1`,
            [accountId]
        );
        return rows[0] || null;
    }

    async setSecurityFlag(client, accountId, status, reason = null) {
        await client.execute(
            `INSERT INTO wallet_security_flags (user_id, status, reason)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE status = VALUES(status), reason = VALUES(reason), updated_at = CURRENT_TIMESTAMP`,
            [accountId, status, reason]
        );
    }

    async registerOrUpdateDevice(client, { accountId, deviceId, deviceInfo, ipAddress, trusted = false }) {
        if (!accountId || !deviceId) return null;

        await client.execute(
            `INSERT INTO user_devices (user_id, device_id, device_info, trusted, last_ip_address)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                 device_info = VALUES(device_info),
                 trusted = IF(trusted = 1, 1, VALUES(trusted)),
                 last_ip_address = VALUES(last_ip_address),
                 last_used_at = CURRENT_TIMESTAMP`,
            [accountId, deviceId, JSON.stringify(deviceInfo || {}), trusted ? 1 : 0, ipAddress || null]
        );

        const [rows] = await client.execute(
            `SELECT * FROM user_devices WHERE user_id = ? AND device_id = ? LIMIT 1`,
            [accountId, deviceId]
        );
        return rows[0] || null;
    }

    async findDevice(client, accountId, deviceId) {
        const [rows] = await client.execute(
            `SELECT * FROM user_devices WHERE user_id = ? AND device_id = ? LIMIT 1`,
            [accountId, deviceId]
        );
        return rows[0] || null;
    }

    async countRecentRows(client, sql, params) {
        const [rows] = await client.execute(sql, params);
        return Number(rows[0]?.count || 0);
    }

    async countRecentWithdrawals(client, accountId, minutes = 10, amountLessThan = null) {
        const conditions = [`user_id = ?`, `created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`];
        const params = [accountId, minutes];

        if (Number.isFinite(Number(amountLessThan))) {
            conditions.push('amount < ?');
            params.push(Number(amountLessThan));
        }

        const [rows] = await client.execute(
            `SELECT COUNT(*) AS count FROM withdrawal_logs WHERE ${conditions.join(' AND ')}`,
            params
        );
        return Number(rows[0]?.count || 0);
    }

    async countRecentTransfersToRecipient(client, accountId, toAccountId, minutes = 10) {
        const [rows] = await client.execute(
            `SELECT COUNT(*) AS count
             FROM withdrawal_logs
             WHERE user_id = ?
               AND event_type = 'TRANSFER'
               AND JSON_UNQUOTE(JSON_EXTRACT(details, '$.toAccountId')) = ?
               AND created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`
            , [accountId, toAccountId, minutes]
        );
        return Number(rows[0]?.count || 0);
    }

    async recordWithdrawalLog(client, { accountId, withdrawalId = null, transactionId = null, eventType, riskLevel = 'LOW', amount = 0, ipAddress = null, deviceId = null, details = {} }) {
        await client.execute(
            `INSERT INTO withdrawal_logs (
                user_id, withdrawal_id, transaction_id, event_type, risk_level, amount, ip_address, device_id, details
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                accountId,
                withdrawalId,
                transactionId,
                eventType,
                riskLevel,
                amount,
                ipAddress,
                deviceId,
                JSON.stringify(details || {})
            ]
        );
    }

    async createOtpVerification(client, { accountId, transactionId, otpCode, deviceId = null, ipAddress = null }) {
        const salt = crypto.randomBytes(12).toString('hex');
        const hashed = hashOtp(otpCode, salt);
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);

        await client.execute(
            `INSERT INTO otp_verifications (
                user_id, transaction_id, otp_code, otp_salt, expires_at, verified, attempts, max_attempts, device_id, ip_address
             ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
            [accountId, transactionId, hashed, salt, expiresAt, OTP_MAX_ATTEMPTS, deviceId, ipAddress]
        );

        const [rows] = await client.execute(
            `SELECT * FROM otp_verifications WHERE transaction_id = ? LIMIT 1`,
            [transactionId]
        );
        return rows[0] || null;
    }

    async getOtpVerification(client, transactionId) {
        const [rows] = await client.execute(
            `SELECT * FROM otp_verifications WHERE transaction_id = ? LIMIT 1`,
            [transactionId]
        );
        return rows[0] || null;
    }

    async verifyWithdrawalOtp(client, { accountId, transactionId, otpCode }) {
        const otpRecord = await this.getOtpVerification(client, transactionId);
        if (!otpRecord || otpRecord.user_id !== accountId) {
            throw new Error('OTP_VERIFICATION_NOT_FOUND');
        }

        if (otpRecord.verified) {
            return { verified: true, alreadyVerified: true };
        }

        if (new Date(otpRecord.expires_at).getTime() < Date.now()) {
            await client.execute(`UPDATE withdrawals SET status = 'FAILED' WHERE id = ?`, [otpRecord.withdrawal_id || transactionId]);
            throw new Error('OTP_EXPIRED');
        }

        const attemptCount = Number(otpRecord.attempts || 0) + 1;
        const hashedAttempt = hashOtp(otpCode, otpRecord.otp_salt);

        if (hashedAttempt !== otpRecord.otp_code) {
            await client.execute(
                `UPDATE otp_verifications SET attempts = ?, verified = 0 WHERE id = ?`,
                [attemptCount, otpRecord.id]
            );

            if (attemptCount >= Number(otpRecord.max_attempts || OTP_MAX_ATTEMPTS)) {
                await client.execute(`UPDATE withdrawals SET status = 'FAILED' WHERE id = ?`, [otpRecord.withdrawal_id || transactionId]);
                await client.execute(`UPDATE transactions SET status = 'FAILED' WHERE id = ?`, [transactionId]);
                throw new Error('OTP_ATTEMPTS_EXCEEDED');
            }

            throw new Error('INVALID_OTP');
        }

        await client.execute(
            `UPDATE otp_verifications SET verified = 1, verified_at = NOW(), attempts = ? WHERE id = ?`,
            [attemptCount, otpRecord.id]
        );

        return { verified: true, record: otpRecord };
    }

    async finalizeWithdrawalAfterOtp(client, { accountId, transactionId }) {
        const [transactionRows] = await client.execute(
            `SELECT * FROM transactions WHERE id = ? LIMIT 1`,
            [transactionId]
        );
        const transaction = transactionRows[0];
        if (!transaction) {
            throw new Error('TRANSACTION_NOT_FOUND');
        }

        const [withdrawalRows] = await client.execute(
            `SELECT * FROM withdrawals WHERE reference_id = ? LIMIT 1`,
            [transaction.reference_id]
        );

        const withdrawal = withdrawalRows[0];
        if (!withdrawal) {
            throw new Error('WITHDRAWAL_NOT_FOUND');
        }

        if (withdrawal.status === 'SUCCESS') {
            return this.mapWithdrawalRow(withdrawal);
        }

        const finalizedLedger = await this.finalizeWithdrawalTransaction(client, {
            accountId,
            amount: Number(withdrawal.amount),
            referenceId: withdrawal.reference_id,
            withdrawalId: withdrawal.id,
            transactionId
        });

        await this.recordWithdrawalLog(client, {
            accountId,
            withdrawalId: withdrawal.id,
            transactionId,
            eventType: 'WITHDRAWAL_OTP_VERIFIED',
            riskLevel: withdrawal.risk_level,
            amount: Number(withdrawal.amount),
            details: { finalizedLedgerId: finalizedLedger?.id || null }
        });

        const [updatedRows] = await client.execute(
            `SELECT * FROM withdrawals WHERE id = ? LIMIT 1`,
            [withdrawal.id]
        );

        return this.mapWithdrawalRow(updatedRows[0] || withdrawal);
    }

    async createSupportTicket(client, { accountId, subject, description }) {
        const [result] = await client.execute(
            `INSERT INTO support_tickets (user_id, subject, description, status) VALUES (?, ?, ?, 'OPEN')`,
            [accountId, subject, description]
        );

        const [rows] = await client.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [result.insertId]);
        return rows[0] || null;
    }

    async listSupportTicketsForUser(accountId, limit = 20) {
        const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(Number(limit), 50)) : 20;
        const result = await query(
            `SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
            [accountId, safeLimit]
        );
        return result.rows;
    }

    async updateSupportTicketStatus(client, ticketId, status, resolvedBy = null) {
        await client.execute(
            `UPDATE support_tickets SET status = ?, resolved_at = IF(? = 'RESOLVED', NOW(), resolved_at) WHERE id = ?`,
            [status, status, ticketId]
        );
        return { ticketId, status, resolvedBy };
    }

    async reserveReference(client, referenceId, transactionKind) {
        const [res] = await client.execute(
            `INSERT IGNORE INTO transaction_refs (reference_id, transaction_kind)
             VALUES (?, ?)`,
            [referenceId, transactionKind]
        );
        return res.affectedRows === 1;
    }

    async ensureWallet(client, accountId) {
        await client.execute(
            `INSERT IGNORE INTO wallets (user_id, balance_cached)
             VALUES (?, 0)`,
            [accountId]
        );
    }

    async recalculateWalletBalance(client, accountId) {
        const [rows] = await client.execute(
            `SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger WHERE account_id = ?`,
            [accountId]
        );
        const balance = Number.parseFloat(rows[0]?.balance || 0);

        await client.execute(
            `UPDATE wallets SET balance_cached = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
            [balance, accountId]
        );

        return balance;
    }

    async insertAdminLog(client, { adminId, action, targetId, metaData }) {
        await client.execute(
            `INSERT INTO admin_logs (admin_id, action, target_id, meta_data)
             VALUES (?, ?, ?, ?)`,
            [
                String(adminId || 'system'),
                action,
                String(targetId),
                JSON.stringify(metaData || {})
            ]
        );
    }

    getRiskLevel({ amount, trustedUser, isFirstWithdrawal, frequentAttempts, hasFailedAttempts }) {
        // Only trigger admin intervention for amounts exceeding 10,000
        if (amount > 10000) {
            return 'HIGH';
        }
        return 'LOW';
    }

    async evaluateWithdrawalRisk(client, {
        accountId,
        amount,
        ipAddress,
        userAgent,
        toAccountId = null,
        actionType = 'WITHDRAW'
    }) {
        const deviceId = buildDeviceId({ ipAddress, userAgent });
        const deviceRecord = await this.findDevice(client, accountId, deviceId);
        const securityFlag = await this.getSecurityFlag(client, accountId);
        const recentWithdrawals = await this.countRecentWithdrawals(client, accountId, 10);
        const recentSmallWithdrawals = await this.countRecentWithdrawals(client, accountId, 10, 5000);
        const recentTransfersToSameRecipient = toAccountId
            ? await this.countRecentTransfersToRecipient(client, accountId, toAccountId, 10)
            : 0;

        const suspiciousBehavior = recentSmallWithdrawals >= 3 || recentTransfersToSameRecipient >= 3;
        const newDevice = !deviceRecord;
        const newIpAddress = deviceRecord?.last_ip_address ? deviceRecord.last_ip_address !== ipAddress : true;
        const highRisk = amount > 5000 || newDevice || newIpAddress || recentWithdrawals >= 3 || suspiciousBehavior;

        if (securityFlag?.status === 'FROZEN') {
            throw new Error('ACCOUNT_FROZEN');
        }

        const shouldForceOtp = highRisk || securityFlag?.status === 'SUSPICIOUS';

        const securityEvents = [];

        if (newDevice) {
            securityEvents.push({
                type: 'NEW_DEVICE',
                severity: 'HIGH',
                message: 'A new device was detected for this account.'
            });
        }

        if (newIpAddress) {
            securityEvents.push({
                type: 'NEW_IP',
                severity: 'MEDIUM',
                message: 'A new IP address was detected for this account.'
            });
        }

        if (amount > 5000) {
            securityEvents.push({
                type: 'LARGE_AMOUNT',
                severity: 'HIGH',
                message: 'Withdrawal amount exceeded the high-risk threshold.'
            });
        }

        if (recentWithdrawals >= 3) {
            securityEvents.push({
                type: 'RATE_SPIKE',
                severity: 'HIGH',
                message: 'Multiple withdrawals were attempted in a short window.'
            });
        }

        if (suspiciousBehavior) {
            securityEvents.push({
                type: 'FRAUD_PATTERN',
                severity: 'HIGH',
                message: 'Basic behavioral fraud rules were triggered.'
            });
        }

        const deviceInfo = {
            userAgent: userAgent || null,
            actionType,
            detectedAt: new Date().toISOString()
        };

        return {
            deviceId,
            deviceRecord,
            securityFlag,
            recentWithdrawals,
            recentSmallWithdrawals,
            recentTransfersToSameRecipient,
            suspiciousBehavior,
            newDevice,
            newIpAddress,
            highRisk,
            shouldForceOtp,
            securityEvents,
            deviceInfo
        };
    }

    async finalizeWithdrawalTransaction(client, { accountId, amount, referenceId, withdrawalId, transactionId }) {
        const [withdrawalLedger] = await client.execute(
            `INSERT INTO ledger (account_id, amount, transaction_type, reference_id)
             VALUES (?, ?, 'WITHDRAWAL', ?)`,
            [accountId, -amount, referenceId]
        );

        await client.execute(
            `INSERT INTO ledger (account_id, amount, transaction_type, reference_id)
             VALUES (?, ?, 'ESCROW_WITHDRAWAL', ?)`,
            [this.dummyEscrowAccountId, -amount, `${referenceId}_escrow`]
        );

        await client.execute(
            `UPDATE withdrawals SET status = 'SUCCESS', processed_at = NOW() WHERE id = ?`,
            [withdrawalId]
        );

        await client.execute(
            `UPDATE transactions SET status = 'SUCCESS', otp_required = 0 WHERE id = ?`,
            [transactionId]
        );

        await this.recalculateWalletBalance(client, accountId);
        await this.recalculateWalletBalance(client, this.dummyEscrowAccountId);

        const [rows] = await client.execute(`SELECT * FROM ledger WHERE id = ? LIMIT 1`, [withdrawalLedger.insertId]);
        return rows[0] || null;
    }

    async getLastLedgerTime(client, accountId, transactionType) {
        const [rows] = await client.execute(
            `SELECT created_at FROM ledger
             WHERE account_id = ? AND transaction_type = ?
             ORDER BY created_at DESC
             LIMIT 1`,
            [accountId, transactionType]
        );
        return rows[0]?.created_at || null;
    }

    async validateWithdrawalGuards(client, { accountId, amount, kycVerified }) {
        if (this.requireKycForWithdrawal && !kycVerified) {
            throw new Error('KYC_VERIFICATION_REQUIRED');
        }

        const hasActive = await this.hasActiveWithdrawal(client, accountId);
        if (hasActive) {
            throw new Error('ACTIVE_WITHDRAWAL_EXISTS');
        }

        await client.execute(
            `SELECT id FROM accounts WHERE id = ? FOR UPDATE`,
            [accountId]
        );

        const balance = await this.recalculateWalletBalance(client, accountId);
        if (balance < amount) {
            throw new Error(`Insufficient funds. Available: ${balance}, Required: ${amount}`);
        }

        const todayTotal = await this.getTodayWithdrawalTotal(client, accountId);
        if (todayTotal + amount > this.dailyLimit) {
            throw new Error('DAILY_WITHDRAWAL_LIMIT_EXCEEDED');
        }
    }

    async validateCooldowns(client, accountId) {
        const lastDepositAt = await this.getLastLedgerTime(client, accountId, 'DEPOSIT');
        if (lastDepositAt && Date.now() - new Date(lastDepositAt).getTime() < 30 * 60 * 1000) {
            throw new Error('COOLDOWN_AFTER_DEPOSIT_ACTIVE');
        }

        const lastWithdrawAt = await this.getLastLedgerTime(client, accountId, 'WITHDRAWAL_HOLD');
        if (lastWithdrawAt && Date.now() - new Date(lastWithdrawAt).getTime() < 5 * 60 * 1000) {
            throw new Error('COOLDOWN_AFTER_WITHDRAWAL_ACTIVE');
        }
    }

    resolveWithdrawalOutcome(riskLevel, otpCode) {
        if (riskLevel === 'HIGH') {
            return { status: 'WAITING_ADMIN', requiresOtp: false, autoProcessed: false };
        }

        // All amounts <= 10000 (LOW risk) are automatically and immediately passed.
        return { status: 'SUCCESS', requiresOtp: false, autoProcessed: true };
    }

    async hasActiveWithdrawal(client, accountId) {
        const [rows] = await client.execute(
            `SELECT id FROM withdrawals
             WHERE user_id = ? AND status IN ('PENDING', 'PROCESSING', 'WAITING_ADMIN', 'PENDING_OTP')
             LIMIT 1`,
            [accountId]
        );
        return rows.length > 0;
    }

    async getTodayWithdrawalTotal(client, accountId) {
        const [rows] = await client.execute(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM withdrawals
             WHERE user_id = ?
               AND status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'WAITING_ADMIN')
               AND created_at >= DATE(NOW())`,
            [accountId]
        );

        return Number.parseFloat(rows[0]?.total || 0);
    }

    async hasRecentFailedWithdrawal(client, accountId, minutes = 60) {
        const [rows] = await client.execute(
            `SELECT id FROM withdrawals
             WHERE user_id = ?
               AND status = 'REJECTED'
               AND created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
             LIMIT 1`,
            [accountId, minutes]
        );
        return rows.length > 0;
    }

    async findWithdrawalByIdempotencyKey(client, idempotencyKey) {
        const [rows] = await client.execute(
            `SELECT * FROM withdrawals WHERE idempotency_key = ? LIMIT 1`,
            [idempotencyKey]
        );
        return rows[0] || null;
    }

    mapWithdrawalRow(row) {
        return {
            id: Number(row.id),
            userId: row.user_id,
            amount: Number(row.amount),
            status: row.status,
            riskLevel: row.risk_level,
            method: row.method,
            accountDetails: row.account_details,
            idempotencyKey: row.idempotency_key,
            referenceId: row.reference_id,
            createdAt: row.created_at,
            processedAt: row.processed_at
        };
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

    async getTransferCounterpartyAccountId(referenceId, currentAccountId) {
        const baseReference = String(referenceId || '').replace(/_(out|in)$/u, '');
        if (!baseReference) return null;

        const result = await query(
            `SELECT account_id, transaction_type, reference_id
             FROM ledger
             WHERE reference_id IN (?, ?)
             ORDER BY created_at ASC, id ASC`,
            [`${baseReference}_out`, `${baseReference}_in`]
        );

        const rows = Array.isArray(result.rows) ? result.rows : [];

        const counterpartyRow = rows.find((row) => row.account_id !== currentAccountId);
        return counterpartyRow?.account_id || null;
    }

    async getBalance(accountId) {
        const res = await query(
            `SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger WHERE account_id = ?`,
            [accountId]
        );
        return Number.parseFloat(res.rows[0]?.balance || 0);
    }

    async getRecentTransactions(accountId, limit = 5) {
        const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(Number(limit), 200)) : 5;
        const res = await query(
            `SELECT id, account_id, amount, transaction_type, reference_id, created_at
             FROM ledger
             WHERE account_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT ?`,
            [accountId, safeLimit]
        );
        return res.rows;
    }

    async executeDeposit(accountId, amount, referenceId, options = {}) {
        return await runInTransaction(async (client) => {
            await this.ensureAccount(client, accountId);
            await this.ensureWallet(client, accountId);
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

            // Double Entry Bookkeeping: Add to Escrow Account
            await client.execute(
                `INSERT INTO ledger (account_id, amount, transaction_type, reference_id)
                 VALUES (?, ?, 'ESCROW_DEPOSIT', ?)`,
                [this.dummyEscrowAccountId, amount, `${referenceId}_escrow`]
            );

            await this.recalculateWalletBalance(client, accountId);
            await this.recalculateWalletBalance(client, this.dummyEscrowAccountId);

            const deviceId = buildDeviceId({ ipAddress: options.ipAddress, userAgent: options.userAgent });
            if (deviceId) {
                await this.registerOrUpdateDevice(client, {
                    accountId,
                    deviceId,
                    deviceInfo: { userAgent: options.userAgent || null, actionType: 'DEPOSIT' },
                    ipAddress: options.ipAddress || null,
                    trusted: true
                });
                await this.recordWithdrawalLog(client, {
                    accountId,
                    transactionId: res.insertId,
                    eventType: 'DEPOSIT',
                    riskLevel: 'LOW',
                    amount,
                    ipAddress: options.ipAddress || null,
                    deviceId,
                    details: { referenceId }
                });
            }

            const [rows] = await client.execute(`SELECT * FROM ledger WHERE id = ? LIMIT 1`, [res.insertId]);
            return rows[0];
        });
    }

    async executeWithdraw(accountId, amount, referenceId, options = {}) {
        return await runInTransaction(async (client) => {
            await this.ensureAccount(client, accountId);
            await this.ensureWallet(client, accountId);
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

            await this.recalculateWalletBalance(client, accountId);

            const deviceId = buildDeviceId({ ipAddress: options.ipAddress, userAgent: options.userAgent });
            if (deviceId) {
                await this.registerOrUpdateDevice(client, {
                    accountId,
                    deviceId,
                    deviceInfo: { userAgent: options.userAgent || null, actionType: 'WITHDRAWAL' },
                    ipAddress: options.ipAddress || null,
                    trusted: Boolean(options.trustedUser)
                });
                await this.recordWithdrawalLog(client, {
                    accountId,
                    transactionId: res.insertId,
                    eventType: 'WITHDRAWAL_DIRECT',
                    riskLevel: 'LOW',
                    amount,
                    ipAddress: options.ipAddress || null,
                    deviceId,
                    details: { referenceId }
                });
            }

            const [rows] = await client.execute(`SELECT * FROM ledger WHERE id = ? LIMIT 1`, [res.insertId]);
            return rows[0];
        });
    }

    async executeTransfer(fromAccountId, toAccountId, amount, referenceId, options = {}) {
        return await runInTransaction(async (client) => {
            await this.ensureAccount(client, fromAccountId);
            await this.ensureAccount(client, toAccountId);
            await this.ensureWallet(client, fromAccountId);
            await this.ensureWallet(client, toAccountId);

            const deviceId = buildDeviceId({ ipAddress: options.ipAddress, userAgent: options.userAgent });
            const recentSameRecipient = await this.countRecentTransfersToRecipient(client, fromAccountId, toAccountId, 10);
            if (recentSameRecipient >= 3) {
                await this.setSecurityFlag(client, fromAccountId, 'SUSPICIOUS', 'Rapid repeated transfers to the same recipient');
            }
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

            await this.recalculateWalletBalance(client, fromAccountId);
            await this.recalculateWalletBalance(client, toAccountId);

            if (deviceId) {
                await this.registerOrUpdateDevice(client, {
                    accountId: fromAccountId,
                    deviceId,
                    deviceInfo: { userAgent: options.userAgent || null, actionType: 'TRANSFER' },
                    ipAddress: options.ipAddress || null,
                    trusted: Boolean(options.trustedUser)
                });
                await this.recordWithdrawalLog(client, {
                    accountId: fromAccountId,
                    transactionId: debitRes.insertId,
                    eventType: 'TRANSFER',
                    riskLevel: 'LOW',
                    amount,
                    ipAddress: options.ipAddress || null,
                    deviceId,
                    details: { referenceId, toAccountId }
                });
            }

            return [debitRows[0], creditRows[0]];
        });
    }

    async createWithdrawalRequest({
        accountId,
        amount,
        referenceId,
        idempotencyKey,
        method,
        accountDetails,
        trustedUser,
        kycVerified,
        ipAddress,
        userAgent
    }) {
        const methodValue = ['UPI', 'BANK'].includes(String(method || '').toUpperCase())
            ? String(method).toUpperCase()
            : 'UPI';
        const idemKey = String(idempotencyKey || referenceId).trim();
        if (!idemKey) throw new Error('IDEMPOTENCY_KEY_REQUIRED');

        return await runInTransaction(async (client) => {
            await this.ensureAccount(client, accountId);
            await this.ensureWallet(client, accountId);

            const existingByKey = await this.findWithdrawalByIdempotencyKey(client, idemKey);
            if (existingByKey) {
                return {
                    withdrawal: this.mapWithdrawalRow(existingByKey),
                    reused: true
                };
            }

            const reserved = await this.reserveReference(client, idemKey, 'WITHDRAW_REQUEST');
            if (!reserved) {
                const duplicate = await this.findWithdrawalByIdempotencyKey(client, idemKey);
                if (duplicate) {
                    return {
                        withdrawal: this.mapWithdrawalRow(duplicate),
                        reused: true
                    };
                }
                throw new Error('IDEMPOTENCY_KEY_ALREADY_USED');
            }

            await this.validateWithdrawalGuards(client, { accountId, amount, kycVerified });
            await this.validateCooldowns(client, accountId);

            const [existingWithdrawalRows] = await client.execute(
                `SELECT id FROM withdrawals WHERE user_id = ? AND status IN ('PENDING', 'PROCESSING', 'WAITING_ADMIN', 'PENDING_OTP') LIMIT 1`,
                [accountId]
            );
            const isFirstWithdrawal = existingWithdrawalRows.length === 0;

            const riskSignals = await this.evaluateWithdrawalRisk(client, {
                accountId,
                amount,
                ipAddress,
                userAgent,
                actionType: 'WITHDRAW'
            });

            const riskLevel = riskSignals.highRisk ? 'HIGH' : 'LOW';
            const requiresOtp = false;
            const autoProcessed = true;

            await this.registerOrUpdateDevice(client, {
                accountId,
                deviceId: riskSignals.deviceId,
                deviceInfo: riskSignals.deviceInfo,
                ipAddress,
                trusted: !requiresOtp && !riskSignals.newDevice
            });

            if (riskSignals.highRisk || riskSignals.suspiciousBehavior || riskSignals.newDevice || riskSignals.newIpAddress) {
                await this.setSecurityFlag(
                    client,
                    accountId,
                    'SUSPICIOUS',
                    riskSignals.highRisk ? 'Risk engine triggered' : 'New device or IP detected'
                );
            }

            const [transactionInsert] = await client.execute(
                `INSERT INTO transactions (user_id, type, amount, status, reference_id, ip_address, device_id, otp_required)
                 VALUES (?, 'WITHDRAW', ?, 'PENDING', ?, ?, ?, ?)`,
                [accountId, -amount, referenceId, ipAddress || null, riskSignals.deviceId, requiresOtp ? 1 : 0]
            );

            const [withdrawalInsert] = await client.execute(
                `INSERT INTO withdrawals (
                    user_id, amount, status, risk_level, method, account_details, idempotency_key, reference_id, processed_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
                [
                    accountId,
                    amount,
                    'PROCESSING',
                    riskLevel,
                    methodValue,
                    JSON.stringify(accountDetails || {}),
                    idemKey,
                    referenceId,
                    null
                ]
            );

            await this.recordWithdrawalLog(client, {
                accountId,
                withdrawalId: withdrawalInsert.insertId,
                transactionId: transactionInsert.insertId,
                eventType: requiresOtp ? 'WITHDRAWAL_PENDING_OTP' : 'WITHDRAWAL_REQUEST',
                riskLevel,
                amount,
                ipAddress,
                deviceId: riskSignals.deviceId,
                details: {
                    trustedUser: Boolean(trustedUser),
                    kycVerified: Boolean(kycVerified),
                    recentWithdrawals: riskSignals.recentWithdrawals,
                    recentSmallWithdrawals: riskSignals.recentSmallWithdrawals,
                    suspiciousBehavior: riskSignals.suspiciousBehavior,
                    newDevice: riskSignals.newDevice,
                    newIpAddress: riskSignals.newIpAddress
                }
            });

            await this.finalizeWithdrawalTransaction(client, {
                accountId,
                amount,
                referenceId,
                withdrawalId: withdrawalInsert.insertId,
                transactionId: transactionInsert.insertId
            });

            const [rows] = await client.execute(
                `SELECT * FROM withdrawals WHERE id = ? LIMIT 1`,
                [withdrawalInsert.insertId]
            );

            return {
                withdrawal: this.mapWithdrawalRow(rows[0]),
                reused: false,
                requiresOtp,
                riskLevel,
                autoProcessed,
                otpChallenge: null,
                securityEvents: riskSignals.securityEvents,
                signals: {
                    isFirstWithdrawal,
                    recentAttempts: riskSignals.recentWithdrawals,
                    hasFailedAttempts: false,
                    trustedUser: Boolean(trustedUser),
                    ipAddress: ipAddress || null,
                    userAgent: userAgent || null,
                    deviceId: riskSignals.deviceId
                }
            };
        });
    }

    async getWithdrawalRequestsForUser(accountId, limit = 10) {
        const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(Number(limit), 50)) : 10;
        const result = await query(
            `SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
            [accountId, safeLimit]
        );
        return result.rows.map((row) => this.mapWithdrawalRow(row));
    }

    async getWithdrawalsForAdmin(filters = {}) {
        const limit = Number.isFinite(Number(filters.limit)) ? Math.max(1, Math.min(Number(filters.limit), 200)) : 50;
        const offset = Number.isFinite(Number(filters.offset)) ? Math.max(0, Number(filters.offset)) : 0;
        const status = String(filters.status || '').trim().toUpperCase();

        const params = [];
        let where = '';
        if (status) {
            where = 'WHERE w.status = ?';
            params.push(status);
        }

        const result = await query(
            `SELECT w.*, u.identifier
             FROM withdrawals w
             LEFT JOIN users u ON u.id = CONCAT('user_', w.user_id)
             ${where}
             ORDER BY w.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return result.rows.map((row) => ({
            ...this.mapWithdrawalRow(row),
            identifier: row.identifier || null
        }));
    }

    async getEscrowSummary() {
        await this.ensureDummyEscrowAccount();

        const accountRows = await query(
            `SELECT a.id, a.owner_name, COALESCE(w.balance_cached, 0) AS balance_cached
             FROM accounts a
             LEFT JOIN wallets w ON w.user_id = a.id
             WHERE a.id = ?
             LIMIT 1`,
            [this.dummyEscrowAccountId]
        );

        const account = accountRows.rows[0] || null;
        const balance = Number.parseFloat(account?.balance_cached || 0);

        return {
            accountId: account?.id || this.dummyEscrowAccountId,
            ownerName: account?.owner_name || this.dummyEscrowOwnerName,
            balance,
            isDummy: true
        };
    }

    async listWithdrawalsByStatus(status, limit = 50) {
        const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(Number(limit), 200)) : 50;
        const normalizedStatus = String(status || '').trim().toUpperCase();
        const result = await query(
            `SELECT * FROM withdrawals WHERE status = ? ORDER BY created_at ASC LIMIT ?`,
            [normalizedStatus, safeLimit]
        );

        return result.rows.map((row) => this.mapWithdrawalRow(row));
    }

    async settleWithdrawal(client, withdrawal) {
        if (!withdrawal) {
            throw new Error('WITHDRAWAL_NOT_FOUND');
        }

        await client.execute(
            `UPDATE withdrawals SET status = 'SUCCESS', processed_at = NOW() WHERE id = ?`,
            [withdrawal.id]
        );

        await client.execute(
            `UPDATE transactions SET status = 'SUCCESS' WHERE reference_id = ?`,
            [withdrawal.reference_id]
        );

        const finalReferenceId = withdrawal.referenceId || withdrawal.reference_id;
        const finalUserId = withdrawal.userId || withdrawal.user_id;

        await client.execute(
            `UPDATE ledger SET transaction_type = 'WITHDRAWAL'
             WHERE account_id = ? AND reference_id = ?`,
            [finalUserId, `${finalReferenceId}_hold`]
        );

        // Double Entry Bookkeeping: Deduct from Escrow Account for late settlements
        await client.execute(
            `INSERT INTO ledger (account_id, amount, transaction_type, reference_id)
             VALUES (?, ?, 'ESCROW_WITHDRAWAL', ?)`,
            [this.dummyEscrowAccountId, -Number(withdrawal.amount), `${finalReferenceId}_escrow`]
        );

        await this.recalculateWalletBalance(client, finalUserId);
        await this.recalculateWalletBalance(client, this.dummyEscrowAccountId);

        return {
            ...withdrawal,
            status: 'SUCCESS',
            processedAt: new Date().toISOString()
        };
    }

    async processPendingWithdrawals({ limit = 25, adminId = 'system', force = false } = {}) {
        return await runInTransaction(async (client) => {
            const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
            const [rows] = await client.execute(
                `SELECT * FROM withdrawals
                 WHERE status = 'PROCESSING'
                 ORDER BY created_at ASC
                 LIMIT ${safeLimit}`
            );

            const processed = [];
            for (const row of rows) {
                const mapped = this.mapWithdrawalRow(row);
                const settled = await this.settleWithdrawal(client, mapped);
                await this.insertAdminLog(client, {
                    adminId,
                    action: force ? 'WITHDRAWAL_FORCE_SETTLED' : 'WITHDRAWAL_SETTLED',
                    targetId: mapped.id,
                    metaData: { referenceId: mapped.referenceId, riskLevel: mapped.riskLevel }
                });
                processed.push(settled);
            }

            return processed;
        });
    }

    async runEscrowReconciliation() {
        return await this.getEscrowSummary();
    }

    async approveWithdrawal(withdrawalId, { adminId, force = false } = {}) {
        return await runInTransaction(async (client) => {
            const [rows] = await client.execute(
                `SELECT * FROM withdrawals WHERE id = ? FOR UPDATE`,
                [withdrawalId]
            );

            const withdrawal = rows[0];
            if (!withdrawal) throw new Error('WITHDRAWAL_NOT_FOUND');
            if (['SUCCESS', 'REJECTED'].includes(withdrawal.status)) {
                throw new Error('WITHDRAWAL_ALREADY_FINALIZED');
            }

            await client.execute(
                `UPDATE withdrawals SET status = 'PROCESSING' WHERE id = ?`,
                [withdrawalId]
            );

            await this.insertAdminLog(client, {
                adminId,
                action: force ? 'WITHDRAWAL_FORCE_APPROVE' : 'WITHDRAWAL_APPROVE',
                targetId: withdrawalId,
                metaData: { riskLevel: withdrawal.risk_level, referenceId: withdrawal.reference_id }
            });

            const settled = await this.settleWithdrawal(client, this.mapWithdrawalRow({
                ...withdrawal,
                id: withdrawal.id
            }));

            const [updatedRows] = await client.execute(
                `SELECT * FROM withdrawals WHERE id = ? LIMIT 1`,
                [withdrawalId]
            );

            return this.mapWithdrawalRow(updatedRows[0] || settled);
        });
    }

    async rejectWithdrawal(withdrawalId, { adminId, reason } = {}) {
        return await runInTransaction(async (client) => {
            const [rows] = await client.execute(
                `SELECT * FROM withdrawals WHERE id = ? FOR UPDATE`,
                [withdrawalId]
            );

            const withdrawal = rows[0];
            if (!withdrawal) throw new Error('WITHDRAWAL_NOT_FOUND');
            if (['SUCCESS', 'REJECTED'].includes(withdrawal.status)) {
                throw new Error('WITHDRAWAL_ALREADY_FINALIZED');
            }

            await client.execute(
                `UPDATE withdrawals SET status = 'REJECTED', processed_at = NOW() WHERE id = ?`,
                [withdrawalId]
            );

            await client.execute(
                `UPDATE transactions SET status = 'FAILED' WHERE reference_id = ?`,
                [withdrawal.reference_id]
            );

            await client.execute(
                `INSERT INTO ledger (account_id, amount, transaction_type, reference_id)
                 VALUES (?, ?, 'REFUND', ?)`,
                [withdrawal.user_id, Number(withdrawal.amount), `${withdrawal.reference_id}_refund`]
            );

            await client.execute(
                `INSERT INTO transactions (user_id, type, amount, status, reference_id)
                 VALUES (?, 'REFUND', ?, 'SUCCESS', ?)`,
                [withdrawal.user_id, Number(withdrawal.amount), `${withdrawal.reference_id}_refund`]
            );

            await this.recalculateWalletBalance(client, withdrawal.user_id);

            await this.insertAdminLog(client, {
                adminId,
                action: 'WITHDRAWAL_REJECT',
                targetId: withdrawalId,
                metaData: { reason: reason || null, referenceId: withdrawal.reference_id }
            });

            const [updatedRows] = await client.execute(
                `SELECT * FROM withdrawals WHERE id = ? LIMIT 1`,
                [withdrawalId]
            );

            return this.mapWithdrawalRow(updatedRows[0]);
        });
    }

    async getAdminLogs(limit = 50, offset = 0) {
        const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(Number(limit), 200)) : 50;
        const safeOffset = Number.isFinite(Number(offset)) ? Math.max(0, Number(offset)) : 0;
        const result = await query(
            `SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [safeLimit, safeOffset]
        );
        return result.rows;
    }
}

module.exports = MysqlWalletAdapter;
