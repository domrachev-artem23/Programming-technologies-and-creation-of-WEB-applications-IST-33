import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL in backend/.env first');
const target = new URL(connectionString);
const database = decodeURIComponent(target.pathname.replace(/^\//, ''));
if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('Database name must contain only letters, digits, and underscores');
const adminUrl = new URL(connectionString);
adminUrl.pathname = '/postgres';
const admin = new Pool({ connectionString: adminUrl.toString() });
try {
  const found = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]);
  if (!found.rowCount) {
    await admin.query(`CREATE DATABASE "${database}"`);
    console.log(`Created database ${database}`);
  } else console.log(`Database ${database} already exists`);
} finally { await admin.end(); }
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = await readFile(path.join(__dirname, '..', 'schema.sql'), 'utf8');
const pool = new Pool({ connectionString });
try {
  await pool.query(schema);
  console.log('FinBuddy schema is ready');
} finally { await pool.end(); }
