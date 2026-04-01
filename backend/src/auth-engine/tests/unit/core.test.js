const tokenEngine = require('../../core/token');
const identityEngine = require('../../core/identity');
const MockStorageAdapter = require('../../adapters/storage/mock');

describe('Token Engine', () => {
    beforeAll(() => {
        tokenEngine.__init__('test-secret', '15m');
    });

    test('generates and verifies access token', () => {
        const payload = { sub: 'user_123', sid: 'session_456' };
        const token = tokenEngine.generateAccessToken(payload);

        expect(token).toBeDefined();

        const decoded = tokenEngine.verifyAccessToken(token);
        expect(decoded.sub).toBe('user_123');
        expect(decoded.sid).toBe('session_456');
    });

    test('throws error on tampered token', () => {
        const payload = { sub: 'user_123' };
        const token = tokenEngine.generateAccessToken(payload);
        const tamperedToken = token + 'bad';

        expect(() => {
            tokenEngine.verifyAccessToken(tamperedToken);
        }).toThrow('INVALID_TOKEN');
    });

    test('generates and hashes refresh token consistently', () => {
        const rawToken = tokenEngine.generateRefreshToken();
        expect(rawToken).toBeDefined();

        const hash1 = tokenEngine.hashRefreshToken(rawToken);
        const hash2 = tokenEngine.hashRefreshToken(rawToken);

        expect(hash1).toBe(hash2);
    });
});

describe('Identity Engine', () => {
    let mockDb;

    beforeEach(() => {
        mockDb = new MockStorageAdapter();
        identityEngine.__init__(mockDb);
    });

    test('creates user securely', async () => {
        const user = await identityEngine.createUser({
            identifier: 'test@test.com',
            password: 'secret_password'
        });

        expect(user.id).toBeDefined();
        expect(user.identifier).toBe('test@test.com');
        expect(user.password_hash).not.toBe('secret_password');
    });

    test('verifies correct password', async () => {
        const user = await identityEngine.createUser({
            identifier: 'test2@test.com',
            password: 'correct_horse'
        });

        const isValid = await identityEngine.verifyPassword(user, 'correct_horse');
        expect(isValid).toBe(true);
    });

    test('rejects incorrect password', async () => {
        const user = await identityEngine.createUser({
            identifier: 'test3@test.com',
            password: 'correct_pwd'
        });

        const isValid = await identityEngine.verifyPassword(user, 'wrong_pwd');
        expect(isValid).toBe(false);
    });
});
