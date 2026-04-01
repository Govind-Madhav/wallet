const policyEngine = require('../core/policy');

const authorize = (policyName) => {
    return async (req, res, next) => {
        try {
            // Ensure authenticate middleware ran first
            if (!req.claims || !req.context) {
                return res.status(500).json({
                    error: 'AUTHORIZATION_CONFIG_ERROR',
                    details: 'Ensure authenticate() runs before authorize()'
                });
            }

            const isAllowed = await policyEngine.evaluatePolicy({
                policy: policyName,
                claims: req.claims,
                context: req.context
            });

            if (isAllowed) {
                return next();
            } else {
                // You could optionally emit the POLICY_DENIED event here
                const events = require('../core/events');
                events.emit(events.EVENTS.POLICY_DENIED, {
                    userId: req.identity?.id,
                    policy: policyName,
                    route: req.context.route
                });

                return res.status(403).json({ error: 'FORBIDDEN_POLICY_DENIED' });
            }

        } catch (err) {
            console.error(`[Auth Policy Error] Policy: ${policyName}`, err);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    };
};

module.exports = authorize;
