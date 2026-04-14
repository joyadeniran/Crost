// scripts/run_migration_api.ts
// Runs a SQL migration file via the Supabase REST API (no direct DB connection needed).
// Usage: tsx scripts/run_migration_api.ts path/to/migration.sql

import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: 'frontend/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set');
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: tsx scripts/run_migration_api.ts path/to/migration.sql');
  process.exit(1);
}

if (!fs.existsSync(migrationFile)) {
  console.error(`Migration file not found: ${migrationFile}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationFile, 'utf8');

async function run() {
  console.log(`\n🚀 Running migration: ${migrationFile}`);
  console.log(`📡 Supabase project: ${supabaseUrl}`);

  // Supabase exposes a /rest/v1/rpc endpoint. For DDL we use the pg-meta SQL endpoint.
  // This endpoint requires the service_role key.
  const projectRef = supabaseUrl!.split('//')[1].split('.')[0];
  const sqlEndpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

  const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

  if (!SUPABASE_ACCESS_TOKEN) {
    // Fall back to the pg-meta SQL endpoint available on the project itself
    // This is available via the dashboard API
    console.log('⚠️  No SUPABASE_ACCESS_TOKEN found. Trying pg-meta endpoint on project...');
    
    // Try the Supabase pg-meta endpoint (available via the service role)
    const pgMetaUrl = `${supabaseUrl}/rest/v1/rpc/exec_sql`;
    
    // Split SQL into individual statements and run each via RPC
    // Note: exec_sql must be a custom function in the DB. Try a simpler approach:
    // We can POST to the SQL API at the project level
    const res = await fetch(`${supabaseUrl}/pg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey!,
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('❌ pg endpoint failed:', res.status, text.substring(0, 500));
      
      // Last resort: try the Supabase Management API
      console.log('\n📋 ALTERNATIVE: Copy and run this SQL in the Supabase SQL Editor:');
      console.log('👉 https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
      console.log('\n--- SQL START ---\n');
      console.log(sql);
      console.log('\n--- SQL END ---\n');
      process.exit(1);
    }

    const data = await res.json();
    console.log('✅ Migration applied successfully!', data);
    return;
  }

  // Use Management API with access token
  const res = await fetch(sqlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('❌ Migration failed:', res.status, text.substring(0, 500));
    process.exit(1);
  }

  const data = await res.json();
  console.log('✅ Migration applied successfully!');
  console.log(JSON.stringify(data, null, 2));
}

run().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
