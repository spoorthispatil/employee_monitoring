import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('✗ DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString?.includes('render.com') ? { rejectUnauthorized: false } : false
});

async function runSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  console.log('Connecting to:', connectionString?.replace(/:[^:@]+@/, ':***@'));
  const client = await pool.connect();
  try {
    console.log('✓ Connected. Running schema.sql...');
    await client.query(schemaSql);
    console.log('✓ Schema applied successfully');
  } catch (err) {
    console.error('✗ Error applying schema:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runSchema();