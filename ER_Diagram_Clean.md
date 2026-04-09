# Clean ER Diagram (Wallet + Auth)

Copy this directly into your report.

## Mermaid ER Diagram

```mermaid
erDiagram
    USERS {
        string id PK
        string identifier UK
        string password_hash
        boolean is_active
        json metadata
        datetime created_at
        datetime updated_at
    }

    SESSIONS {
        string session_id PK
        string user_id FK
        string refresh_token_hash
        string tenant_id
        datetime expires_at
        boolean revoked
        datetime created_at
    }

    PASSWORD_RESET_TOKENS {
        string id PK
        string user_id FK
        string token_hash UK
        datetime expires_at
        datetime used_at
        datetime created_at
    }

    ACCOUNTS {
        string id PK
        string owner_name
        datetime created_at
    }

    LEDGER {
        bigint id PK
        string account_id FK
        decimal amount
        string transaction_type
        string reference_id
        datetime created_at
    }

    TRANSACTION_REFS {
        string reference_id PK
        string transaction_kind
        datetime created_at
    }

    AUDIT_LOGS {
        bigint id PK
        string table_name
        bigint record_id
        string action
        json new_data
        datetime created_at
    }

    USERS ||--o{ SESSIONS : has
    USERS ||--o{ PASSWORD_RESET_TOKENS : requests
    ACCOUNTS ||--o{ LEDGER : records
    TRANSACTION_REFS ||--o{ LEDGER : referenced_by
    LEDGER ||--o{ AUDIT_LOGS : writes_audit
```

## Relationship Summary

1. USERS (1) -> (N) SESSIONS
2. USERS (1) -> (N) PASSWORD_RESET_TOKENS
3. ACCOUNTS (1) -> (N) LEDGER
4. TRANSACTION_REFS (1) -> (N) LEDGER (via reference_id)
5. LEDGER (1) -> (N) AUDIT_LOGS (trigger-based audit writes)

## Figure Caption

Figure: ER diagram of the DBT Wallet system showing authentication entities (users, sessions, password reset tokens) and wallet entities (accounts, ledger, transaction references, audit logs), including idempotency reference mapping and trigger-based audit logging.
