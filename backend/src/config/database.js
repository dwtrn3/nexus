import pg from 'pg';
const { Pool } = pg;

const dbUrl = process.env.DATABASE_URL || 'postgresql://nexus:nexus@localhost:5432/nexus';
const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
const isProduction = process.env.NODE_ENV === 'production';

// Build pool options. SSL is needed for every hosted (non-localhost) Postgres
// provider (Neon, Supabase, ElephantSQL, Vercel Postgres, etc.).
const poolOptions = {
  connectionString: dbUrl,
  max: isProduction ? 5 : 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: isProduction ? 15000 : 5000,
};

// Only add the ssl key when it's actually needed — passing ssl:false
// explicitly can upset some pg versions/connection-string combos.
if (isProduction && !isLocalhost) {
  poolOptions.ssl = { rejectUnauthorized: false };
}

export const pool = new Pool(poolOptions);

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
