-- DBT Wallet Module Database Schema
-- Focus: ACID, Ledger Integrity (Double-Entry), Partitioning, and Triggers

-- 1. Metadata Table
-- Holds basic account info. Note: Balance is NOT stored here to ensure double-entry constraints.
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Audit Table (Must exist before the Trigger is applied)
-- DBT Feature: Completely decoupled audit trail at the database engine layer.
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(50),
    record_id UUID,
    action VARCHAR(50),
    new_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2b. Reference reservation table for idempotency safety.
CREATE TABLE IF NOT EXISTS transaction_refs (
    reference_id VARCHAR(255) PRIMARY KEY,
    transaction_kind VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Partitioned Ledger Table (Double Entry Accounting)
-- Balances are derived exactly from SUM(amount). Debits are negative, Credits are positive.
CREATE TABLE IF NOT EXISTS ledger (
    id UUID DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES accounts(id),
    amount DECIMAL(15, 2) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL, -- 'DEPOSIT', 'WITHDRAWAL', 'TRANSFER'
    reference_id VARCHAR(255),             -- Idempotency key (Prevents duplicate charges)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Partitioning requires the partition key in the PRIMARY KEY.
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_ledger_account_id ON ledger (account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_reference_id ON ledger (reference_id);

-- Create monthly partitions for scaling (e.g., Current Month)
-- Enterprise DBT Scaling Strategy: Data chunking for infinite ledger growth.
CREATE TABLE IF NOT EXISTS ledger_y2026m03 PARTITION OF ledger
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE IF NOT EXISTS ledger_y2026m04 PARTITION OF ledger
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Catch-all partition to avoid insert failures outside pre-created windows.
CREATE TABLE IF NOT EXISTS ledger_default PARTITION OF ledger DEFAULT;

-- 4. DBT Trigger: Audit Log Injection
-- Automatically writes to audit_logs *every* time a ledger entry is created.
CREATE OR REPLACE FUNCTION log_ledger_insert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (table_name, record_id, action, new_data)
    VALUES ('ledger', NEW.id, 'INSERT', row_to_json(NEW));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger is applied to the partitioned table
DROP TRIGGER IF EXISTS trigger_ledger_audit ON ledger;
CREATE TRIGGER trigger_ledger_audit
AFTER INSERT ON ledger
FOR EACH ROW
EXECUTE FUNCTION log_ledger_insert();
