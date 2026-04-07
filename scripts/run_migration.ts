import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: 'frontend/.env.local' });

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('SUPABASE_DB_URL is not set in frontend/.env.local');
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: tsx run_migration.ts path/to/migration.sql');
  process.exit(1);
}

const sql = fs.readFileSync(migrationFile, 'utf8');

async function run() {
  const client = new Client({
    connectionString: dbUrl,
  });

  try {
    await client.connect();
    console.log(`Executing migration: ${migrationFile}...`);
    await client.query(sql);
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
