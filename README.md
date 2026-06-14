# DBT Project Wallet

A full-stack wallet application with modular authentication and wallet engines.

The current UI focuses on the user wallet experience: dashboard balance summary, recent transactions with a full history page, and a local profile editor that includes username and phone number. Admin console entry points are no longer exposed in the frontend.

> [!NOTE]
> **Modular Engines & Full-Stack Integration**:
> - **Modular Engines**: The backend incorporates the modular **Auth Engine** (`backend/src/auth-engine` — featuring claims, JWT rotation, session management, and storage adapters) alongside a dedicated **Wallet Engine** (`backend/src/wallet-engine`).
> - **Full-Stack Application**: This repository integrates these modular engines into an end-to-end **Full-Stack Web Application** (Express API + MySQL DB + React/Vite UI), complete with database scripts and a Windows control panel (`setup.bat`).

Full implementation details are documented in [CHANGELOG.md](CHANGELOG.md).

## System Architecture

The application is built on a **Modular Dual-Engine Architecture** separating security/identity management from financial ledger operations:

```
+-------------------------------------------------------------------+
|                         React Frontend (Vite)                     |
|            Dashboard | Transactions | Profile | Navigation        |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|                        Express Backend API                        |
|                                                                   |
|  +---------------------------+   +-----------------------------+  |
|  |        Auth Engine        |   |        Wallet Engine        |  |
|  |  - JWT Session/Rotation   |   |  - Double-Entry Ledger      |  |
|  |  - Password/Verification  |   |  - Idempotency Reservation |  |
|  |  - Security & Rate Limits |   |  - Balance Derivation (SUM) |  |
|  +---------------------------+   +-----------------------------+  |
|                |                                |                 |
|                v                                v                 |
|  +---------------------------+   +-----------------------------+  |
|  |   Auth Storage Adapters   |   |   Wallet Storage Adapter    |  |
|  | - KnexAuthAdapter (Knex)  |   | - MysqlWalletAdapter(MySQL) |  |
|  | - PostgresAuthAdapter(PG) |   +-----------------------------+  |
|  | - sqlite.js (SQLite)      |                                    |
|  | - mock.js (In-Memory)     |                                    |
|  +---------------------------+                                    |
+----------------|--------------------------------|-----------------+
                 v                                v
+-------------------------------------------------------------------+
|                     Database Persistence Layer                    |
|   MySQL 8+ (Active App)  |  PostgreSQL / SQLite (Supported Engine)|
|   (ACID Transactions, Row Locking, Idempotency & Audit Triggers)  |
+-------------------------------------------------------------------+
```

### Key Architectural Highlights
- **Dual-Engine Modular Backend**:
  - **Auth Engine Adapters**: Offers flexible database storage adapters in `backend/src/auth-engine/adapters/storage/`:
    - `KnexAuthAdapter.js`: Universal ORM/query builder adapter (supports MySQL, PostgreSQL, SQLite).
    - `PostgresAuthAdapter.js`: Native PostgreSQL storage adapter (`$1, $2` syntax).
    - `sqlite.js`: SQLite local database adapter.
    - `mock.js`: In-memory storage adapter for unit tests.
  - **Wallet Engine Adapter**:
    - `MysqlWalletAdapter.js`: Active storage adapter in `backend/src/wallet-engine/adapters/storage/` optimized for MySQL 8+ ACID transactions, row-level locking (`FOR UPDATE`), and trigger-based auditing.
  - **Admin Engine**: REST endpoints for administrative oversight, ledger auditing, and security log reviews.
- **Financial Data Integrity**:
  - **Idempotency**: Utilizes `transaction_refs` to prevent duplicate billing or double-spending on retries.
  - **Concurrency Control**: Implements SQL row-level locking (`SELECT ... FOR UPDATE`) during withdrawal and transfer workflows.
  - **Database Audit Triggers**: Automatically records audit logs on ledger mutations for compliance and traceability.
- **Modern React Frontend**:
  - Modular UI built with Vite, React hooks, custom context, dynamic dark/light themes, and responsive wallet dashboard views.

## Tech Stack
- **Backend**: Node.js, Express, MySQL 8+ (Knex.js + `mysql2` connection pool)
- **Frontend**: React, Vite, Vanilla CSS
- **Auth**: Modular Auth Engine (JWT, refresh token rotation, email verification)
- **Database**: Relational SQL schema with triggers, views, and row-level locking

## Current Frontend Flow
- Dashboard: shows recent transactions on the left and the available balance on the right
- Transactions: opens a separate full-history page from the dashboard "More" action
- Profile: lets the user edit username, phone number, display name, email, and local notification preferences
- Withdrawal security: OTP verification, device/IP tracking, and pending withdrawal review are part of the wallet flow
- Support: users can create and review support tickets from the wallet routes
- Admin: frontend access removed; backend admin code remains in the repository but is not linked in the app shell

## Prerequisites
- Node.js 20+ (LTS recommended)
- npm
- MySQL 8+

## Environment Setup
1. Copy .env.example to .env
2. Update values in .env, especially:
- DATABASE_URL
- JWT_SECRET

Example DATABASE_URL format:

mysql://root:your_password@127.0.0.1:3306/WalletDB

## Easy Setup & Control Panel (Windows)
For a convenient interactive menu on Windows, run the following batch script from the project root:

```cmd
setup.bat
```

This interactive CLI tool allows you to:
- Perform complete project setup (dependency installation + DB initialization)
- Start backend and frontend servers automatically in separate console windows
- Start only the backend or frontend
- Reset/initialize database
- Run database/SQL tests

---

## Install and Database Setup (CLI Command)
From the project root, run:

npm run setup

This command will:
- Install dependencies in all project package locations
- Create the database if it does not exist
- Initialize database schema

## Manual Setup (Optional)
If you prefer separate steps:

1. Install all dependencies:

npm run install:all

2. Create and initialize the database:

npm run db:setup

## Run the Project
Open two terminals from the project root.

1. Start backend:

npm run dev:backend

2. Start frontend:

npm run dev:frontend

## URLs
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

## Useful Scripts
- npm run setup
- npm run install:all
- npm run db:setup
- npm run test
- npm run test:sql

## Notes
- .env is ignored by git and should never be committed.
- .env.example is safe to share.
- If you change `.env` values such as `ADMIN_IDENTIFIERS`, restart the backend so the new configuration is loaded.
