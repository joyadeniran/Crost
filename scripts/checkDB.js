const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres.vgktzhlfpaetgiqjpnbu:berthD3v%40xyx@aws-0-eu-west-1.pooler.supabase.com:5432/postgres' });
client.connect().then(async () => {
  // Check system config
  const confRes = await client.query(`SELECT key, value FROM system_config`);
  console.log("CONFIGS:", confRes.rows);

  // Check event_log rows
  const eventRes = await client.query(`SELECT count(*) FROM event_log`);
  console.log("EVENT LOG COUNT:", eventRes.rows[0].count);

  process.exit(0);
}).catch(console.error);
