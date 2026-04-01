const EventEmitter = require('events');

class AuthEventEmitter extends EventEmitter { }

const eventEmitter = new AuthEventEmitter();

module.exports = {
    emit: (eventName, data) => eventEmitter.emit(eventName, data),
    on: (eventName, listener) => eventEmitter.on(eventName, listener),
    // Common event names
    EVENTS: {
        LOGIN_SUCCESS: 'loginSuccess',
        LOGIN_FAILURE: 'loginFailure',
        SESSION_CREATED: 'sessionCreated',
        SESSION_REVOKED: 'sessionRevoked',
        TOKEN_REFRESHED: 'tokenRefreshed',
        POLICY_DENIED: 'policyDenied',
        PASSWORD_RESET_REQUESTED: 'passwordResetRequested',
        PASSWORD_RESET_COMPLETED: 'passwordResetCompleted',
        EMAIL_VERIFICATION_REQUESTED: 'emailVerificationRequested',
        EMAIL_VERIFICATION_COMPLETED: 'emailVerificationCompleted'
    }
};
