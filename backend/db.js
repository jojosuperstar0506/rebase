const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Example: postgresql://rebase_app:PASSWORD@localhost:5432/rebase
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.query('SELECT NOW()')
  .then(res => console.log(`[DB] Connected to PostgreSQL at ${res.rows[0].now}`))
  .catch(err => console.error('[DB] PostgreSQL connection failed:', err.message));

module.exports = { pool };
