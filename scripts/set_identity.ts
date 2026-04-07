import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: 'frontend/.env.local' });

const dbUrl = 'postgresql://postgres.vgktzhlfpaetgiqjpnbu:berthD3v%40xyx@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

async function run() {
  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    console.log('Setting local_identity to "Suplias"...');
    await client.query("UPDATE system_config SET value = '\"Suplias\"', is_founder_editable = true WHERE key = 'local_identity';");
    console.log('Successfully updated local_identity.');
  } catch (err) {
    console.error('Update failed:', err);
  } finally {
    await client.end();
  }
}

run();
