import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: 'frontend/.env.local' });

const dbUrl = 'postgresql://postgres.vgktzhlfpaetgiqjpnbu:berthD3v%40xyx@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

async function run() {
  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    const res = await client.query('SELECT key, is_founder_editable FROM system_config;');
    console.table(res.rows);
    
    // Ensure local_identity is editable
    const identity = res.rows.find(r => r.key === 'local_identity');
    if (identity && !identity.is_founder_editable) {
      console.log('Fixing local_identity editable status...');
      await client.query("UPDATE system_config SET is_founder_editable = true WHERE key = 'local_identity';");
      console.log('Updated.');
    }
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
}

run();
