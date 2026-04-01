const events = require('./core/events');
const tokenEngine = require('./core/token');
const claimsEngine = require('./core/claims');
const policyEngine = require('./core/policy');
const identityEngine = require('./core/identity');
const sessionEngine = require('./core/session');
const passwordResetEngine = require('./core/passwordReset');
const emailVerificationEngine = require('./core/emailVerification');
const authenticate = require('./middleware/authenticate');
const authorizeFactory = require('./middleware/authorize');

const init = ({
    storageAdapter,
    claimsResolver,
    policyResolver,
    jwtSecret,
    accessExpiry = '15m',
    refreshExpiryMs = 7 * 24 * 60 * 60 * 1000, // 7 days in MS
    emailVerifyTokenTtlMinutes = Number.parseInt(process.env.EMAIL_VERIFY_TOKEN_TTL_MINUTES, 10) || 30,
    trustJwtClaims = false,
    externalAuthResolver = null
}) => {
    // 1. Validate mandatory injections
    if (!storageAdapter) throw new Error("storageAdapter is required");
    if (!claimsResolver) throw new Error("claimsResolver is required");
    if (!policyResolver) throw new Error("policyResolver is required");
    if (!jwtSecret) throw new Error("jwtSecret is required");

    // 2. Initialize Core Crypto/Tokens
    tokenEngine.__init__(jwtSecret, accessExpiry);

    // 3. Initialize Wrappers
    claimsEngine.__init__(claimsResolver);
    policyEngine.__init__(policyResolver);

    // 4. Initialize Data Logic Layers
    identityEngine.__init__(storageAdapter);
    sessionEngine.__init__(storageAdapter, refreshExpiryMs);
    passwordResetEngine.__init__(storageAdapter);
    emailVerificationEngine.__init__(storageAdapter, emailVerifyTokenTtlMinutes);

    // 5. Build and return the API surface (router required after __init__)
    const router = require('./router/index')({ externalAuthResolver });

    return {
        router,
        authenticate: authenticate({ trustJwtClaims }),
        authorize: authorizeFactory,
        onLoginSuccess: (cb) => events.on(events.EVENTS.LOGIN_SUCCESS, cb),
        onLoginFailure: (cb) => events.on(events.EVENTS.LOGIN_FAILURE, cb),
        onSessionCreated: (cb) => events.on(events.EVENTS.SESSION_CREATED, cb),
        onSessionRevoked: (cb) => events.on(events.EVENTS.SESSION_REVOKED, cb),
        onTokenRefresh: (cb) => events.on(events.EVENTS.TOKEN_REFRESHED, cb),
        onPolicyDenied: (cb) => events.on(events.EVENTS.POLICY_DENIED, cb),
        onPasswordResetRequested: (cb) => events.on(events.EVENTS.PASSWORD_RESET_REQUESTED, cb),
        onPasswordResetCompleted: (cb) => events.on(events.EVENTS.PASSWORD_RESET_COMPLETED, cb),
        onEmailVerificationRequested: (cb) => events.on(events.EVENTS.EMAIL_VERIFICATION_REQUESTED, cb),
        onEmailVerificationCompleted: (cb) => events.on(events.EVENTS.EMAIL_VERIFICATION_COMPLETED, cb)
    };
};

module.exports = {
    init
};
