import pg from 'pg';
const { Pool } = pg;

// In production (Vercel + hosted Postgres), we need:
// 1. SSL — Neon, Supabase, ElephantSQL etc. all require it.
// 2. A longer connection timeout — cold-start serverless functions may
//    take a few seconds before the first DB request lands.
// 3. A small pool (serverless functions are short-lived; each has its own pool).
const isProduction = process.env.NODE_ENV === 'production';
const dbUrl = process.env.DATABASE_URL || 'postgresql://nexus:nexus@localhost:5432/nexus';
const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');

export const pool = new Pool({
  connectionString: dbUrl,
  max: isProduction ? 5 : 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: isProduction ? 15000 : 5000, // cold-start headroom
  // Enable SSL for all hosted (non-localhost) databases.
  // rejectUnauthorized:false lets self-signed certs through (Neon, Supabase, etc.)
  ssl: (isProduction && !isLocalhost) ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message);
});

export async function testConnection() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT NOW() as now');
    console.log('PostgreSQL connected:', rows[0].now);
    return { ok: true, ts: rows[0].now };
  } finally {
    client.release();
  }
}

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) console.warn('Slow query (%dms):', duration, text.slice(0, 80));
  return res;
}
