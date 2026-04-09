require('dotenv').config();
const { pool } = require('./backend/src/config/db');
const KnexAuthAdapter = require('./backend/src/auth-engine/adapters/storage/KnexAuthAdapter');
const knex = require('knex');

async function verify() {
    console.log("1. Initializing Knex Auth Adapter schemas...");
    const dbInstance = knex({ client: 'mysql2', connection: process.env.DATABASE_URL });
    const authAdapter = new KnexAuthAdapter(dbInstance);
    await authAdapter.initSchema();
    
    console.log("\n2. Fetching all tables from database...");
    const dbName = new URL(process.env.DATABASE_URL).pathname.replace('/', '');
    const [rows] = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
        [dbName]
    );
    
    console.log(`\nTables successfully verified in "${dbName}":`);
    rows.forEach((r) => {
        const tableName = r.table_name || r.TABLE_NAME;
        console.log(` - ${tableName}`);
    });
    
    process.exit(0);
}

verify().catch(err => {
    console.error("Verification failed:", err);
    process.exit(1);
});
