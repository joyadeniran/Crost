import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: 'frontend/.env.local' });

const dbUrl = 'postgresql://postgres.vgktzhlfpaetgiqjpnbu:berthD3v%40xyx@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

async function run() {
  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    const res = await client.query("SELECT * FROM pg_policies WHERE tablename = 'system_config';");
    console.log('RLS Policies for system_config:');
    console.table(res.rows.map(r => ({ name: r.policyname, cmd: r.cmd, roles: r.roles, qual: r.qual })));
    
    // Also check if RLS is enabled for the table
    const rlsRes = await client.query("SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'system_config';");
    console.log('RLS Enabled:', rlsRes.rows[0]?.relrowsecurity);

  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
}

run();
