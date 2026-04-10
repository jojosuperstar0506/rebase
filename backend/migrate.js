require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrate() {
  const migrationDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort();

  // Create migrations tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  for (const file of files) {
    const { rows } = await pool.query('SELECT 1 FROM _migrations WHERE filename = $1', [file]);
    if (rows.length > 0) {
      console.log(`[migrate] Skipping ${file} (already applied)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
    console.log(`[migrate] Applying ${file}...`);
    await pool.query(sql);
    await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    console.log(`[migrate] Applied ${file}`);
  }

  console.log('[migrate] All migrations complete.');
  await pool.end();
}

migrate().catch(err => {
  console.error('[migrate] Failed:', err);
  process.exit(1);
});
