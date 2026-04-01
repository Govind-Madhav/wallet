const request = require('supertest');
const express = require('express');
const Auth = require('../../index');
const MockStorageAdapter = require('../../adapters/storage/mock');

describe('API Integration Flows', () => {
    let app, authSystem, mockAdapter;

    beforeAll(() => {
        app = express();
        app.use(express.json());

        mockAdapter = new MockStorageAdapter();

        // Very basic mock claims resolver
        const mockClaimsResolver = async (params) => {
            return { roles: ['user'], tenant: params.context?.tenant || 'default' };
        };

        // Very basic mock policy resolver
        const mockPolicyResolver = async ({ policy, claims, context }) => {
            if (policy === 'canViewDashboard') return claims.roles.includes('user');
            if (policy === 'adminOnly') return claims.roles.includes('admin');
            return false;
        };

        authSystem = Auth.init({
            storageAdapter: mockAdapter,
            claimsResolver: mockClaimsResolver,
            policyResolver: mockPolicyResolver,
            jwtSecret: 'integration-secret-key',
            accessExpiry: '1m', // Short for testing
            refreshExpiryMs: 1000 * 60 * 60 * 24 // 1 day
        });

        app.use('/auth', authSystem.router);

        // Protected test route
        app.get('/api/dashboard',
            authSystem.authenticate,
            authSystem.authorize('canViewDashboard'),
            (req, res) => {
                res.json({ message: 'Welcome to Dashboard', user: req.identity });
            }
        );

        // Admin test route
        app.get('/api/admin',
            authSystem.authenticate,
            authSystem.authorize('adminOnly'),
            (req, res) => {
                res.json({ message: 'Welcome Admin' });
            }
        );
    });

    let userId, accessToken, refreshToken, sessionId;

    test('1. Register successfully', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({ email: 'flow@test.com', password: 'secure_password' });

        expect(res.statusCode).toBe(201);
        expect(res.body.userId).toBeDefined();
        userId = res.body.userId;
    });

    test('2. Login successfully returns tokens', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ email: 'flow@test.com', password: 'secure_password' });

        expect(res.statusCode).toBe(200);
        expect(res.body.accessToken).toBeDefined();
        expect(res.body.refreshToken).toBeDefined();

        accessToken = res.body.accessToken;
        refreshToken = res.body.refreshToken;
        sessionId = res.body.sessionId;

        expect(sessionId).toBeDefined();
    });

    test('3. Access protected route with valid token', async () => {
        const res = await request(app)
            .get('/api/dashboard')
            .set('Authorization', `Bearer ${accessToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Welcome to Dashboard');
    });

    test('4. Fail to access protected route with invalid policy', async () => {
        const res = await request(app)
            .get('/api/admin')
            .set('Authorization', `Bearer ${accessToken}`);

        expect(res.statusCode).toBe(403);
        expect(res.body.error).toBe('FORBIDDEN_POLICY_DENIED');
    });

    test('5. Refresh token returns new access token', async () => {
        const res = await request(app)
            .post('/auth/refresh')
            .send({ refreshToken, sessionId });

        expect(res.statusCode).toBe(200);
        expect(res.body.accessToken).toBeDefined();
        expect(res.body.refreshToken).toBeDefined();
        // JWTs generate the same string within the same second for identical payloads.\n        // expect(res.body.accessToken).not.toBe(accessToken);
        expect(res.body.refreshToken).not.toBe(refreshToken);

        // Update tokens for next test
        accessToken = res.body.accessToken;
        refreshToken = res.body.refreshToken;
    });

    test('6. Logout revokes session', async () => {
        const res = await request(app)
            .post('/auth/logout')
            .send({ sessionId });

        expect(res.statusCode).toBe(200);

        // Verify in mock DB
        const session = await mockAdapter.findSession(sessionId);
        expect(session.revoked).toBe(true);
    });
});
