require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL });
  const [dbRows] = await conn.query('SELECT DATABASE() AS db');
  const db = dbRows[0].db;
  const [tables] = await conn.query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name',
    [db]
  );

  console.log('DATABASE:', db);

  for (const tableRow of tables) {
    const table = tableRow.table_name || tableRow.TABLE_NAME;
    const [countRows] = await conn.query('SELECT COUNT(*) AS c FROM `' + table + '`');
    console.log('\nTABLE:', table, 'rows =', countRows[0].c);

    const [cols] = await conn.query(
      'SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position',
      [db, table]
    );

    for (const col of cols) {
      const columnName = col.column_name || col.COLUMN_NAME;
      const [nullRows] = await conn.query(
        'SELECT COUNT(*) AS c FROM `' + table + '` WHERE `' + columnName + '` IS NULL'
      );
      if (nullRows[0].c > 0) {
        console.log('  NULLS:', columnName, '=', nullRows[0].c);
      }
    }
  }

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
