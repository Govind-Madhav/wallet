# Project Structure

```text
DBT project wallet/
├── CHANGELOG.md
├── ER_Diagram_Clean.md
├── Mini_Project_Documentation.md
├── README.md
├── .env.example
├── package.json
├── backend/
│   ├── package.json
│   └── src/
│       ├── server.js
│       ├── config/
│       │   └── db.js
│       ├── admin-engine/
│       │   └── router/
│       │       └── adminRouter.js
│       ├── wallet-engine/
│       │   ├── adapters/storage/
│       │   │   └── MysqlWalletAdapter.js
│       │   ├── core/
│       │   │   └── WalletCore.js
│       │   └── router/
│       │       └── walletRouter.js
│       └── auth-engine/
│           ├── index.js
│           ├── server.js
│           ├── db/
│           │   ├── index.js
│           │   └── schema.js
│           ├── adapters/storage/
│           │   └── KnexAuthAdapter.js
│           ├── core/
│           │   ├── claims/index.js
│           │   ├── emailVerification/index.js
│           │   ├── events/index.js
│           │   ├── identity/index.js
│           │   ├── passwordReset/index.js
│           │   ├── policy/index.js
│           │   ├── session/index.js
│           │   └── token/index.js
│           ├── middleware/
│           │   ├── authenticate.js
│           │   └── authorize.js
│           ├── router/
│           │   └── index.js
│           ├── services/
│           │   └── emailSender.js
│           └── tests/
│               ├── comprehensive.test.js
│               ├── integration/api.test.js
│               ├── security/attacks.test.js
│               └── unit/core.test.js
├── db-scripts/
│   ├── create_db.js
│   ├── init_db.js
│   ├── schema.sql
│   └── sql_test.js
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── eslint.config.js
│   ├── vite.config.js
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api.js
│       ├── index.css
│       ├── useSession.js
│       ├── useTheme.js
│       ├── useToast.js
│       ├── assets/
│       │   ├── hero.png
│       │   └── vite.svg
│       ├── components/
│       │   ├── ActivityLog.jsx
│       │   ├── AdminPanel.jsx
│       │   ├── AppNav.jsx
│       │   ├── AuthPanel.jsx
│       │   ├── BalanceCard.jsx
│       │   ├── RecentTransactionsPanel.jsx
│       │   ├── SessionPanel.jsx
│       │   ├── ThemeToggle.jsx
│       │   ├── Toast.jsx
│       │   ├── WalletPanel.jsx
│       │   └── admin/
│       │       ├── AdminAuditLogs.jsx
│       │       ├── AdminLedger.jsx
│       │       ├── AdminOverview.jsx
│       │       ├── AdminSessions.jsx
│       │       ├── AdminUsersAccounts.jsx
│       │       └── AdminWithdrawals.jsx
│       └── pages/
│           ├── AuthPage.jsx
│           ├── DashboardPage.jsx
│           ├── AdminPage.jsx
│           ├── ProfilePage.jsx
│           └── TransactionsPage.jsx
```

## Best-Practice Layout Notes

- Keep the root focused on orchestration files only: `README.md`, `.env.example`, `package.json`, and top-level scripts.
- Keep backend code under `backend/src/` and split features by responsibility: `config`, `wallet-engine`, and `auth-engine`.
- Keep frontend code under `frontend/src/` with `components`, `pages`, `assets`, and shared hooks.
- Keep database and bootstrap scripts in `db-scripts/`.
- Keep the admin UI files in `frontend/src/components/admin/` and `frontend/src/pages/AdminPage.jsx` documented as legacy support code, even though the app shell no longer routes to `/admin`.
- The current frontend navigation exposes only Dashboard, Transactions, and Profile.
- Admin console files still exist in the repository, but the main app shell does not route to `/admin`.
- Exclude non-essential runtime files from the structure view, such as `node_modules/`, generated lockfiles, caches, and temporary local DB files.

## Excluded as low-value for the report

- `package-lock.json`
- `frontend/package-lock.json`
- `backend/src/auth-engine/package-lock.json`
- `backend/src/auth-engine/auth.db`
- `Wallet.docx`
- duplicate root `src/` folder entry if it is only a leftover compatibility copy
