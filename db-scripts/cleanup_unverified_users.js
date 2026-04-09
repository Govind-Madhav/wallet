require('dotenv').config();
const knex = require('knex');

const parseFlagValue = (flag, fallback) => {
    const arg = process.argv.find((item) => item.startsWith(`${flag}=`));
    if (!arg) return fallback;

    const value = Number.parseInt(arg.slice(flag.length + 1), 10);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const hasFlag = (flag) => process.argv.includes(flag);

const run = async () => {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is required in .env');
    }

    const apply = hasFlag('--apply');
    const olderThanMinutes = parseFlagValue('--older-than-minutes', 0);
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    const db = knex({
        client: 'mysql2',
        connection: process.env.DATABASE_URL,
    });

    try {
        const candidates = await db('users')
            .select('id', 'identifier', 'email_verified', 'email_verified_at', 'created_at')
            .where((qb) => {
                qb.where('email_verified', false).orWhereNull('email_verified');
            })
            .whereNull('email_verified_at')
            .where('created_at', '<=', cutoff)
            .orderBy('created_at', 'asc');

        console.log(`Found ${candidates.length} unverified user(s) older than ${olderThanMinutes} minute(s).`);

        if (!candidates.length) {
            console.log('No cleanup needed.');
            return;
        }

        console.table(candidates.map((u) => ({
            id: u.id,
            identifier: u.identifier,
            email_verified: u.email_verified,
            created_at: u.created_at,
        })));

        if (!apply) {
            console.log('Dry run only. Re-run with --apply to delete these users.');
            return;
        }

        const ids = candidates.map((u) => u.id);

        await db.transaction(async (trx) => {
            await trx('sessions').whereIn('user_id', ids).del();
            await trx('password_reset_tokens').whereIn('user_id', ids).del();
            await trx('email_verification_tokens').whereIn('user_id', ids).del();
            await trx('users').whereIn('id', ids).del();
        });

        console.log(`Deleted ${ids.length} unverified user(s) and related auth records.`);
    } finally {
        await db.destroy();
    }
};

run().catch((error) => {
    console.error('Cleanup failed:', error.message);
    process.exit(1);
});
