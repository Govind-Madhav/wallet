let resolver = null;

const __init__ = (injectedResolver) => {
    if (typeof injectedResolver !== 'function') {
        throw new Error("claimsResolver must be a function");
    }
    resolver = injectedResolver;
};

const resolveClaims = async ({ userId, sessionId, context }) => {
    if (!resolver) throw new Error("claimsResolver not initialized");

    // The contract expects { roles, permissions, attributes, tenant }
    const claims = await resolver({ userId, sessionId, context });

    return Object.assign({
        roles: [],
        permissions: [],
        attributes: {},
        tenant: null
    }, claims); // Merge with defaults
};

module.exports = {
    __init__,
    resolveClaims
};
