const { drizzle } = require('drizzle-orm/better-sqlite3');
const Database = require('better-sqlite3');
const schema = require('./schema');
const path = require('node:path');

// Connect to local SQLite file
const sqlite = new Database(path.join(__dirname, '../auth.db'));

// Attach Drizzle ORM
const db = drizzle(sqlite, { schema });

module.exports = {
    db,
    sqlite
};
