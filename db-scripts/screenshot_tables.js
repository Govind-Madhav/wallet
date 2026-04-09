require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'report-screenshots');
const MAX_ROWS = 10;

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatValue = (value) => {
  if (value === null || value === undefined) return '<span class="null">NULL</span>';
  if (value instanceof Date) return escapeHtml(value.toISOString());
  if (typeof value === 'object') return escapeHtml(JSON.stringify(value));
  return escapeHtml(value);
};

const createHtml = ({ title, columns, rows, note }) => {
  const tableHead = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('');
  const tableBody = rows.map((row) => {
    const cells = columns.map((column) => `<td>${formatValue(row[column])}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        padding: 24px;
        font-family: Inter, Segoe UI, Arial, sans-serif;
        background: #f8fafc;
        color: #0f172a;
      }
      .card {
        background: white;
        border: 1px solid #dbe3ef;
        border-radius: 16px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        padding: 20px;
        width: fit-content;
        min-width: 860px;
      }
      h1 {
        margin: 0 0 6px 0;
        font-size: 26px;
      }
      .meta {
        margin: 0 0 12px 0;
        color: #64748b;
        font-size: 14px;
      }
      .note {
        margin: 0 0 12px 0;
        padding: 10px 12px;
        border-left: 4px solid #0d9488;
        background: #ecfeff;
        color: #155e75;
        border-radius: 8px;
        font-size: 14px;
      }
      table {
        border-collapse: collapse;
        font-size: 14px;
        min-width: 860px;
      }
      th, td {
        border: 1px solid #cbd5e1;
        padding: 10px 12px;
        vertical-align: top;
        white-space: nowrap;
      }
      th {
        background: #e2e8f0;
        text-align: left;
      }
      tr:nth-child(even) td {
        background: #f8fafc;
      }
      .null {
        color: #b91c1c;
        font-weight: 700;
      }
      .empty {
        padding: 14px;
        color: #64748b;
        font-style: italic;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapeHtml(title)}</h1>
      <p class="meta">Generated from the live database for report screenshots.</p>
      ${note ? `<p class="note">${escapeHtml(note)}</p>` : ''}
      ${rows.length ? `<table><thead><tr>${tableHead}</tr></thead><tbody>${tableBody}</tbody></table>` : '<div class="empty">No rows found.</div>'}
    </div>
  </body>
</html>`;
};

const pickTables = (allTables) => {
  const preferred = [
    'users',
    'sessions',
    'pending_registrations',
    'email_verification_tokens',
    'password_reset_tokens',
    'accounts',
    'ledger',
    'transaction_refs',
    'audit_logs'
  ];

  const lookup = new Set(allTables.map((table) => String(table).toLowerCase()));
  const selected = preferred.filter((table) => lookup.has(table));
  return selected.length ? selected : allTables;
};

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in .env');
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL });
  const [dbRows] = await conn.query('SELECT DATABASE() AS db');
  const db = dbRows[0].db;
  const [tableRows] = await conn.query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name',
    [db]
  );

  const tables = pickTables(tableRows.map((row) => row.table_name || row.TABLE_NAME));

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: 2 });

  for (const table of tables) {
    const [cols] = await conn.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position',
      [db, table]
    );
    const columns = cols.map((col) => col.column_name || col.COLUMN_NAME);

    const orderBy = columns.includes('created_at') ? 'created_at' : (columns[0] || '1');
    const [allRows] = await conn.query('SELECT * FROM `' + table + '` ORDER BY `' + orderBy + '` DESC');
    const rows = allRows.slice(0, MAX_ROWS);
    const note = allRows.length > MAX_ROWS
      ? `Table: ${table} | Showing first ${MAX_ROWS} of ${allRows.length} rows`
      : `Table: ${table} | Rows: ${allRows.length}`;

    await page.setContent(createHtml({ title: `${db}.${table}`, columns, rows, note }), { waitUntil: 'load' });
    const card = page.locator('.card');
    await card.screenshot({
      path: path.join(OUTPUT_DIR, `${table}.png`),
      type: 'png'
    });
    console.log(`Saved screenshot: ${path.join('report-screenshots', `${table}.png`)}`);
  }

  await browser.close();
  await conn.end();
}

main().catch((error) => {
  console.error('Screenshot generation failed:', error);
  process.exit(1);
});