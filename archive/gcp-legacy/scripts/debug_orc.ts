import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: 'frontend/.env.local' });

const dbUrl = 'postgresql://postgres.vgktzhlfpaetgiqjpnbu:berthD3v%40xyx@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

async function run() {
  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    const res = await client.query('SELECT persona_prompt FROM departments WHERE is_orchestrator = true LIMIT 1;');
    console.log('--- PROMPT START ---');
    console.log(res.rows[0]?.persona_prompt);
    console.log('--- PROMPT END ---');
    
    // Also check event_log for the last failed JSON
    const logRes = await client.query("SELECT metadata FROM event_log WHERE event_type = 'error' AND department_slug = 'orchestrator' ORDER BY created_at DESC LIMIT 1;");
    if (logRes.rows.length > 0) {
      console.log('--- LAST ERROR METADATA START ---');
      console.log(JSON.stringify(logRes.rows[0].metadata, null, 2));
      console.log('--- LAST ERROR METADATA END ---');
    }
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await client.end();
  }
}

run();
