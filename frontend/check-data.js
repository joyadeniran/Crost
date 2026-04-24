const { Client } = require('pg')

async function run() {
  const connectionString = 'postgresql://postgres:berthD3v%40xyx@db.vgktzhlfpaetgiqjpnbu.supabase.co:5432/postgres'
  const client = new Client({ connectionString })

  try {
    await client.connect()
    
    const events = await client.query("SELECT * FROM event_log WHERE description ILIKE '%mortem%' ORDER BY created_at DESC LIMIT 5;")
    console.log('EVENTS:', events.rows.map(r => r.description))

    const memos = await client.query("SELECT * FROM company_memos WHERE title ILIKE '%mortem%' OR body ILIKE '%mortem%' ORDER BY created_at DESC LIMIT 5;")
    console.log('MEMOS:', memos.rows.map(r => r.title))
  } catch (err) {
    console.error(err)
  } finally {
    await client.end()
  }
}

run()
