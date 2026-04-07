import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'frontend/.env.local' });
const dbUrl = 'postgresql://postgres.vgktzhlfpaetgiqjpnbu:berthD3v%40xyx@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

async function run() {
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    const res = await client.query(`
      SELECT description, metadata->>'raw_response' as raw_response 
      FROM event_log 
      WHERE event_type = 'error' AND description = 'Orchestrator parse failed.' 
      ORDER BY created_at DESC LIMIT 1;
    `);
    console.log(JSON.stringify(res.rows[0], null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
