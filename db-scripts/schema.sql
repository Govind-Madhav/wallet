-- DBT Wallet Module Database Schema (MySQL 8)
-- Focus: ACID, Ledger Integrity (Double-Entry), and Triggers

-- 1. Metadata Table
-- Holds basic account info. Note: Balance is NOT stored here to ensure double-entry constraints.
CREATE TABLE IF NOT EXISTS accounts (
    id CHAR(36) PRIMARY KEY,
    owner_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Audit Table (Must exist before the Trigger is applied)
-- DBT Feature: Completely decoupled audit trail at the database engine layer.
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    table_name VARCHAR(50),
    record_id BIGINT UNSIGNED,
    action VARCHAR(50),
    new_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2b. Reference reservation table for idempotency safety.
CREATE TABLE IF NOT EXISTS transaction_refs (
    reference_id VARCHAR(255) PRIMARY KEY,
    transaction_kind VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Ledger Table (Double Entry Accounting)
-- Balances are derived exactly from SUM(amount). Debits are negative, Credits are positive.
CREATE TABLE IF NOT EXISTS ledger (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    account_id CHAR(36) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    reference_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_ledger_account FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX idx_ledger_account_id ON ledger (account_id);
CREATE INDEX idx_ledger_reference_id ON ledger (reference_id);

-- 3b. Wallet read model (optional cache)
CREATE TABLE IF NOT EXISTS wallets (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    balance_cached DECIMAL(15, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_wallet_user (user_id)
);

-- 3c. Transaction journal for status-driven operations.
CREATE TABLE IF NOT EXISTS transactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    type VARCHAR(50) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    reference_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_transactions_reference (reference_id),
    KEY idx_transactions_user_created (user_id, created_at)
);

-- 3d. Withdrawal state machine records.
CREATE TABLE IF NOT EXISTS withdrawals (
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
);

-- 3e. Admin identities and audit log.
CREATE TABLE IF NOT EXISTS admins (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    UNIQUE KEY uniq_admins_email (email)
);

CREATE TABLE IF NOT EXISTS admin_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    admin_id VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_id VARCHAR(255) NOT NULL,
    meta_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_admin_logs_created (created_at)
);

-- 4. DBT Trigger: Audit Log Injection
DROP TRIGGER IF EXISTS trigger_ledger_audit;

CREATE TRIGGER trigger_ledger_audit
AFTER INSERT ON ledger
FOR EACH ROW
INSERT INTO audit_logs (table_name, record_id, action, new_data)
VALUES (
    'ledger',
    NEW.id,
    'INSERT',
    JSON_OBJECT(
        'id', NEW.id,
        'account_id', NEW.account_id,
        'amount', NEW.amount,
        'transaction_type', NEW.transaction_type,
        'reference_id', NEW.reference_id,
        'created_at', NEW.created_at
    )
);
