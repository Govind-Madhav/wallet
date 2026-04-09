const mysql = require('mysql2/promise');
require('dotenv').config();

// Shared Connection Pool for both Auth Engine and Wallet Engine
const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    multipleStatements: true,
    enableKeepAlive: true,
    idleTimeout: 30000,
    connectTimeout: 2000,
});

const query = async (text, params) => {
    const [rows] = await pool.query(text, params);
    return { rows, rowCount: Array.isArray(rows) ? rows.length : 0 };
};

const runInTransaction = async (callback) => {
    const client = await pool.getConnection();
    try {
        await client.beginTransaction();
        const result = await callback(client);
        await client.commit();
        return result;
    } catch (e) {
        await client.rollback();
        throw e;
    } finally {
        client.release();
    }
};

module.exports = { pool, query, runInTransaction };
