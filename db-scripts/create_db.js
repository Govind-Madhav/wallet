const mysql = require('mysql2/promise');
require('dotenv').config();

async function createDB() {
    const dbUrl = new URL(process.env.DATABASE_URL);
    const dbName = dbUrl.pathname.replace('/', '') || 'WalletDB';

    const conn = await mysql.createConnection({
        host: dbUrl.hostname,
        port: Number(dbUrl.port || 3306),
        user: decodeURIComponent(dbUrl.username),
        password: decodeURIComponent(dbUrl.password)
    });

    try {
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        console.log(`Database "${dbName}" is ready.`);
    } catch (e) {
        console.error("Failed to create DB:", e);
        process.exit(1);
    } finally {
        await conn.end();
    }
}

createDB();
