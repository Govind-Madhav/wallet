# Implementation Changelog

This file records the full set of changes that were added across the wallet app, backend, database, and docs so nothing is left implicit.

## 1. Product Direction

- The frontend now centers on the user wallet experience only.
- Admin console entry points were removed from the app shell.
- The dashboard was redesigned around a split layout with recent activity on the left and available balance on the right.
- A separate transactions page and a separate profile page were added.

## 2. Frontend Changes

### Navigation and layout

- Added `frontend/src/components/AppNav.jsx` for Dashboard, Transactions, and Profile navigation.
- Added `frontend/src/components/BalanceCard.jsx` for the right-side balance summary on the dashboard.
- Reworked `frontend/src/pages/DashboardPage.jsx` into a two-column layout with recent transactions, wallet actions, balance summary, and session details.
- Added `frontend/src/pages/TransactionsPage.jsx` for the full transaction ledger.
- Added `frontend/src/pages/ProfilePage.jsx` for local profile editing.
- Updated `frontend/src/App.jsx` to route to `/transactions` and `/profile`.

### Wallet UX

- Updated `frontend/src/components/WalletPanel.jsx` to:
  - generate 6-character alphanumeric transaction IDs,
  - remove wallet currency symbols from user-facing balance display,
  - support OTP verification for withdrawals,
  - show pending withdrawals,
  - support the dashboard layout where balance is shown in a separate summary card.
- Updated `frontend/src/components/RecentTransactionsPanel.jsx` to:
  - show transaction references clearly,
  - support a larger limit for the full ledger page,
  - add filter pills,
  - add a `More` link from the dashboard to the full transactions page.

### Auth and session UX

- Updated `frontend/src/components/AuthPanel.jsx` to carry registration metadata such as phone number, bank name, and UPI ID.
- Updated `frontend/src/components/SessionPanel.jsx` to present the current session, account identity, and linked demo details in the new card style.
- Updated `frontend/src/components/Toast.jsx`, `ThemeToggle.jsx`, and `useTheme.js` to match the refreshed UI system.

### Admin frontend status

- Admin UI files remain in the repository for reference and legacy support.
- The main app shell no longer routes to `/admin`.
- The dashboard no longer exposes an admin link.

## 3. Backend Changes

### Auth engine

- Updated `backend/src/auth-engine/adapters/storage/KnexAuthAdapter.js` to create and populate linked bank and UPI tables.
- Updated `backend/src/auth-engine/router/index.js` so login success responses include `userId`.
- Added `backend/src/auth-engine/services/emailSender.js` support for wallet security alert emails.

### Wallet engine

- Expanded `backend/src/wallet-engine/adapters/storage/MysqlWalletAdapter.js` with:
  - OTP verification tables and helpers,
  - user device tracking,
  - withdrawal logs,
  - support tickets,
  - wallet security flags,
  - withdrawal risk evaluation,
  - withdrawal request processing,
  - OTP finalization,
  - admin withdrawal approval/rejection,
  - escrow summary support,
  - admin audit log support.
- Updated `backend/src/wallet-engine/core/WalletCore.js` to expose the new wallet and security operations.
- Updated `backend/src/wallet-engine/router/walletRouter.js` to expose:
  - `/verify-otp`
  - `/withdrawals`
  - support ticket creation and listing
  - request-context forwarding for IP and device tracking

### Server and admin routes

- Updated `backend/src/server.js` to:
  - wire the admin router,
  - apply admin rate limiting,
  - resolve admin roles from metadata and allowlist identifiers,
  - send wallet security alert emails,
  - start wallet background jobs,
  - initialize wallet schema at startup.
- Added `backend/src/admin-engine/router/adminRouter.js` for admin overview, users, accounts, ledger, withdrawals, support tickets, and admin logs.

## 4. Database Changes

- Updated `db-scripts/schema.sql` with the current tables and support structures.
- Added or expanded support for:
  - `wallets`
  - `transactions`
  - `withdrawals`
  - `admins`
  - `admin_logs`
  - `otp_verifications`
  - `user_devices`
  - `withdrawal_logs`
  - `support_tickets`
  - `wallet_security_flags`
  - `user_linked_banks`
  - `user_linked_upis`
- Kept the ledger as the source of truth for balances.
- Added transaction reference protection and idempotency support.

## 5. Security and Risk Controls

- Added risk-based OTP verification for withdrawals.
- Added device and IP tracking for financial actions.
- Added withdrawal rate and behavior checks.
- Added suspicious-account flagging.
- Added email security alerts for OTP requests and security events.
- Added support tickets so users can report wallet issues.
- Added admin-side withdrawal review and queue processing.

## 6. Documentation Changes

- Updated `README.md` to describe the current user-facing app flow.
- Updated `PROJECT_STRUCTURE.md` to include the new dashboard, profile, transactions, and legacy admin files.
- Updated `Mini_Project_Documentation.md` to reflect the redesigned wallet flow and current schema direction.
- Updated `frontend/README.md` to describe the user-facing screens and the removed admin entry point.
- Updated `ER_Diagram_Clean.md` to match the expanded schema.

## 7. Current Runtime State

- Admin access is no longer exposed in the frontend.
- The account cleanup performed during the session removed the local user data that had been present in the database.
- The admin allowlist in `.env` was cleared.
- The current app flow is dashboard, transactions, and profile.

## 8. Notes

- Some admin-oriented backend and frontend code still exists in the repository for reference and backend support.
- Profile edits are currently stored locally in the browser.
- If you change environment values such as `ADMIN_IDENTIFIERS`, restart the backend so the new configuration is loaded.