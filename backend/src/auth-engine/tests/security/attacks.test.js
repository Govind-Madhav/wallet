const request = require('supertest');
const express = require('express');
const Auth = require('../../index');
const MockStorageAdapter = require('../../adapters/storage/mock');

describe('Security Integrations & Attack Resistance', () => {
    let app, authSystem, mockAdapter, sessionId, oldRefreshToken, currentRefreshToken;
    const securityTestPassword = ['strong', 'attack', 'pass'].join('_');

    beforeAll(() => {
        app = express();
        app.use(express.json());

        mockAdapter = new MockStorageAdapter();
        const mockClaimsResolver = async () => ({ roles: [] });
        const mockPolicyResolver = async () => true;

        authSystem = Auth.init({
            storageAdapter: mockAdapter,
            claimsResolver: mockClaimsResolver,
            policyResolver: mockPolicyResolver,
            jwtSecret: 'super-secret'
        });

        app.use('/auth', authSystem.router);
    });

    test('Setup: Register and Login', async () => {
        await request(app).post('/auth/register').send({ email: 'sec@test.com', password: securityTestPassword });
        const loginRes = await request(app).post('/auth/login').send({ email: 'sec@test.com', password: securityTestPassword });

        oldRefreshToken = loginRes.body.refreshToken;
        sessionId = loginRes.body.sessionId;
        expect(sessionId).toBeDefined();
        expect(oldRefreshToken).toBeDefined();
    });

    test('1. Refresh Token Rotation (Happy Path)', async () => {
        const res = await request(app)
            .post('/auth/refresh')
            .send({ refreshToken: oldRefreshToken, sessionId });

        expect(res.statusCode).toBe(200);
        currentRefreshToken = res.body.refreshToken;
    });

    test('2. Replay Attack Detection (Reusing old token)', async () => {
        // Attack: Try to use the oldRefreshToken again after it was rotated
        const res = await request(app)
            .post('/auth/refresh')
            .send({ refreshToken: oldRefreshToken, sessionId });

        expect(res.statusCode).toBe(401);
        expect(res.body.error).toBe('INVALID_REFRESH_TOKEN');

        // In a highly advanced system, detecting this could trigger automatic revocation
        // of the active session as well, as it implies token theft. For now, it just rejects.
    });

    test('3. Revoked session prevents refresh', async () => {
        // Manually revoke the session
        await mockAdapter.revokeSession(sessionId);

        // Attacker tries to refresh with the currently valid token
        const res = await request(app)
            .post('/auth/refresh')
            .send({ refreshToken: currentRefreshToken, sessionId });

        expect(res.statusCode).toBe(401);
        expect(res.body.error).toBe('SESSION_REVOKED');
    });

    test('4. Token Tampering on Protected Route', async () => {
        // Standard JWT tampering
        const forgedJwt = [
            'eyJhbGciOiJIUzI1NiIsInR5cCI',
            'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ',
            'invalid_sig'
        ].join('.');

        app.get('/api/secret', authSystem.authenticate, (req, res) => res.json({ access: true }));

        const res = await request(app)
            .get('/api/secret')
            .set('Authorization', `Bearer ${forgedJwt}`);

        expect(res.statusCode).toBe(401);
        expect(res.body.error).toBe('INVALID_TOKEN');
    });
});
