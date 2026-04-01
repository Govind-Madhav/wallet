let resolver = null;

const __init__ = (injectedResolver) => {
    if (typeof injectedResolver !== 'function') {
        throw new Error("policyResolver must be a function");
    }
    resolver = injectedResolver;
};

const evaluatePolicy = async ({ policy, claims, context }) => {
    if (!resolver) throw new Error("policyResolver not initialized");

    // The contract expects a true|false return value
    const result = await resolver({ policy, claims, context });

    return !!result; // Ensure boolean
};

module.exports = {
    __init__,
    evaluatePolicy
};
