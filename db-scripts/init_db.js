const fs = require('fs');
const path = require('path');
const { pool } = require('../backend/src/config/db');

async function init() {
    try {
        const walletSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        await pool.query(walletSql);
        console.log('Wallet Schema successfully initialized.');
        process.exit(0);
    } catch (err) {
        console.error('Failed to initialize schemas:', err);
        process.exit(1);
    }
}

init();
