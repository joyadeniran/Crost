import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: 'frontend/.env.local' });

const dbUrl = 'postgresql://postgres.vgktzhlfpaetgiqjpnbu:berthD3v%40xyx@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

async function run() {
  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    const res = await client.query('SELECT key FROM system_config;');
    console.log('Existing keys:', res.rows.map(r => r.key));
    
    if (!res.rows.find(r => r.key === 'local_identity')) {
      console.log('Seeding local_identity...');
      await client.query("INSERT INTO system_config (key, value, is_founder_editable) VALUES ('local_identity', 'null', true);");
      console.log('Seeded local_identity.');
    }
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
}

run();
