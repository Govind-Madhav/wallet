const { Pool } = require('pg');
require('dotenv').config();

// Shared Connection Pool for both Auth Engine and Wallet Engine
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

const query = async (text, params) => {
    return pool.query(text, params);
};

const runInTransaction = async (callback) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
};

module.exports = { pool, query, runInTransaction };
