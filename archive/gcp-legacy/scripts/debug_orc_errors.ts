import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: 'frontend/.env.local' });

const dbUrl = 'postgresql://postgres.vgktzhlfpaetgiqjpnbu:berthD3v%40xyx@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

async function run() {
  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    
    // Check event_log for the last failed JSON
    const logRes = await client.query("SELECT * FROM event_log WHERE event_type = 'error' AND department_slug = 'orchestrator' ORDER BY created_at DESC LIMIT 5;");
    
    console.log('--- RECENT ORC ERRORS START ---');
    for (const row of logRes.rows) {
      console.log(`\nID: ${row.id} | Created: ${row.created_at}`);
      console.log(`Description: ${row.description}`);
      console.log('Metadata:', JSON.stringify(row.metadata, null, 2));
    }
    console.log('--- RECENT ORC ERRORS END ---');

  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
}

run();
