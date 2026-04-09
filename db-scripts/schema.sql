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
