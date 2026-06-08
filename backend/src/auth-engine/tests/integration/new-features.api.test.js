const express = require('express');
const request = require('supertest');

const createWalletRouter = require('../../../wallet-engine/router/walletRouter');
const createAdminRouter = require('../../../admin-engine/router/adminRouter');

describe('Wallet/Admin API New Feature Flows', () => {
    let app;
    let walletCore;
    let query;

    beforeEach(() => {
        app = express();
        app.use(express.json());

        walletCore = {
            requestWithdrawal: jest.fn(async (accountId, amount, options) => ({
                withdrawal: {
                    id: 101,
                    userId: accountId,
                    amount,
                    status: options.otpCode ? 'SUCCESS' : 'PENDING',
                    riskLevel: 'MEDIUM',
                    method: options.method || 'UPI',
                    idempotencyKey: options.idempotencyKey,
                    referenceId: options.referenceId
                },
                reused: false,
                requiresOtp: !options.otpCode,
                riskLevel: 'MEDIUM',
                autoProcessed: Boolean(options.otpCode)
            })),
            getUserWithdrawals: jest.fn(async () => ([
                {
                    id: 101,
                    userId: '11111111-1111-1111-1111-111111111111',
                    amount: 125,
                    status: 'PENDING',
                    riskLevel: 'MEDIUM',
                    method: 'UPI',
                    createdAt: new Date().toISOString()
                }
            ])),
            getWithdrawalsForAdmin: jest.fn(async () => ([
                {
                    id: 201,
                    userId: '11111111-1111-1111-1111-111111111111',
                    identifier: 'user@example.com',
                    amount: 3500,
                    status: 'WAITING_ADMIN',
                    riskLevel: 'HIGH',
                    method: 'BANK',
                    referenceId: 'WD-201',
                    createdAt: new Date().toISOString()
                }
            ])),
            approveWithdrawal: jest.fn(async (withdrawalId) => ({ id: withdrawalId, status: 'SUCCESS' })),
            rejectWithdrawal: jest.fn(async (withdrawalId) => ({ id: withdrawalId, status: 'REJECTED' })),
            getAdminLogs: jest.fn(async () => ([])),
            getEscrowSummary: jest.fn(async () => ({
                accountId: 'dummy_escrow_account',
                ownerName: 'Dummy Escrow Account',
                balance: 0,
                isDummy: true
            })),
            adapter: {
                processPendingWithdrawals: jest.fn(async () => ([{ id: 201, status: 'SUCCESS' }]))
            }
        };

        query = jest.fn(async (sql) => {
            if (sql.includes('total_users')) return { rows: [{ total_users: 5 }] };
            if (sql.includes('active_sessions')) return { rows: [{ active_sessions: 2 }] };
            if (sql.includes('total_accounts')) return { rows: [{ total_accounts: 4 }] };
            if (sql.includes('ledger_entries')) return { rows: [{ ledger_entries: 12, net_amount: 100, absolute_amount: 220 }] };
            if (sql.includes('total_withdrawals')) return { rows: [{ total_withdrawals: 3, waiting_admin: 1 }] };
            if (sql.includes('total_transactions')) return { rows: [{ total_transactions: 14 }] };
            return { rows: [] };
        });

        app.use('/api/wallet', (req, res, next) => {
            req.claims = {
                accountId: '11111111-1111-1111-1111-111111111111',
                trustedUser: true,
                kycVerified: true
            };
            req.context = { requestIp: '127.0.0.1', userAgent: 'jest' };
            next();
        }, createWalletRouter(walletCore));

        app.use('/api/admin', (req, res, next) => {
            req.identity = { id: 'admin_1' };
            req.claims = { roles: ['admin'] };
            next();
        }, createAdminRouter({ query, walletCore }));
    });

    test('accepts new withdrawal payload fields and calls requestWithdrawal', async () => {
        const response = await request(app)
            .post('/api/wallet/withdraw')
            .send({
                amount: 125,
                referenceId: 'WD-NEW-1',
                idempotencyKey: 'IDEMP-NEW-1',
                method: 'UPI',
                accountDetails: { upiId: 'abc@upi' },
                otpCode: '123456'
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(walletCore.requestWithdrawal).toHaveBeenCalledWith(
            '11111111-1111-1111-1111-111111111111',
            125,
            expect.objectContaining({
                referenceId: 'WD-NEW-1',
                idempotencyKey: 'IDEMP-NEW-1',
                method: 'UPI',
                otpCode: '123456'
            })
        );
    });

    test('returns user withdrawal history from new endpoint', async () => {
        const response = await request(app).get('/api/wallet/withdrawals?limit=5');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.withdrawals)).toBe(true);
        expect(walletCore.getUserWithdrawals).toHaveBeenCalled();
    });

    test('admin force approve requires super_admin role', async () => {
        const response = await request(app)
            .post('/api/admin/withdrawals/201/approve')
            .send({ force: true });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe('FORCE_APPROVE_REQUIRES_SUPER_ADMIN');
    });

    test('admin process queue endpoint returns processed count', async () => {
        const response = await request(app)
            .post('/api/admin/withdrawals/process-queue')
            .send({ limit: 10 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.processedCount).toBe(1);
        expect(walletCore.adapter.processPendingWithdrawals).toHaveBeenCalledWith(
            expect.objectContaining({
                limit: 10,
                adminId: 'admin_1',
                force: false
            })
        );
    });

    test('admin overview includes dummy escrow fields', async () => {
        const response = await request(app).get('/api/admin/overview');

        expect(response.status).toBe(200);
        expect(response.body.totals.escrowAccountId).toBe('dummy_escrow_account');
        expect(response.body.totals.escrowOwnerName).toBe('Dummy Escrow Account');
        expect(response.body.totals.escrowIsDummy).toBe(true);
    });
});
