import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: 'frontend/.env.local' });

const dbUrl = 'postgresql://postgres.vgktzhlfpaetgiqjpnbu:berthD3v%40xyx@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

async function run() {
  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    
    // Check goals for failed ones
    const goalsRes = await client.query("SELECT id, title, outcome, created_at FROM goals WHERE status = 'failed' ORDER BY created_at DESC LIMIT 3;");
    
    console.log('--- RECENT FAILED GOALS START ---');
    for (const row of goalsRes.rows) {
      console.log(`\nID: ${row.id} | Created: ${row.created_at}`);
      console.log(`Title: ${row.title}`);
      console.log(`Outcome: ${row.outcome}`);
    }
    console.log('--- RECENT FAILED GOALS END ---');

  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
}

run();
