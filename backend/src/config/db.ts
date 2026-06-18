import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://trader:secure_password@localhost:5432/options_intelligence';

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

export async function queryDB<T = any>(text: string, params?: any[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function insertDB(text: string, params?: any[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT NOW()');
    console.log('[DB] PostgreSQL connected successfully');
    return true;
  } catch (err: any) {
    console.error('[DB] PostgreSQL connection failed:', err.message);
    return false;
  }
}
