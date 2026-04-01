const { Client } = require('pg');
require('dotenv').config();

async function createDB() {
    const dbUrl = new URL(process.env.DATABASE_URL);
    const dbName = dbUrl.pathname.replace('/', '');
    
    // Connect to the default 'postgres' database to create the new one
    dbUrl.pathname = '/postgres';
    const client = new Client({ connectionString: dbUrl.toString() });

    try {
        await client.connect();
        const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
        if (res.rowCount === 0) {
            console.log(`Database "${dbName}" does not exist. Creating...`);
            await client.query(`CREATE DATABASE "${dbName}"`);
            console.log(`Database "${dbName}" created successfully!`);
        } else {
            console.log(`Database "${dbName}" already exists.`);
        }
    } catch (e) {
        console.error("Failed to create DB:", e);
        process.exit(1);
    } finally {
        await client.end();
    }
}

createDB();
