require('dotenv').config();
const { pool } = require('./backend/src/config/db');
const KnexAuthAdapter = require('./backend/src/auth-engine/adapters/storage/KnexAuthAdapter');
const knex = require('knex');

async function verify() {
    console.log("1. Initializing Knex Auth Adapter schemas...");
    const dbInstance = knex({ client: 'pg', connection: process.env.DATABASE_URL });
    const authAdapter = new KnexAuthAdapter(dbInstance);
    await authAdapter.initSchema();
    
    console.log("\n2. Fetching all tables from database...");
    const res = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);
    
    const dbName = process.env.DATABASE_URL.split('/').pop();
    console.log(`\nTables successfully verified in "${dbName}":`);
    res.rows.forEach(r => console.log(` - ${r.table_name}`));
    
    process.exit(0);
}

verify().catch(err => {
    console.error("Verification failed:", err);
    process.exit(1);
});
