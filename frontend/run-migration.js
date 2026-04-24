const fs = require('fs')
const { Client } = require('pg')

async function run() {
  const connectionString = 'postgresql://postgres:berthD3v%40xyx@db.vgktzhlfpaetgiqjpnbu.supabase.co:5432/postgres'
  const client = new Client({ connectionString })

  try {
    const sql = fs.readFileSync('/Users/joyadeniran/Documents/Crost/supabase/migrations/20260424_add_suggested_actions.sql', 'utf8')
    await client.connect()
    console.log('Connected to Supabase Postgres...')
    
    await client.query(sql)
    console.log('Migration successfully applied!')
  } catch (err) {
    console.error('Error applying migration:', err)
  } finally {
    await client.end()
  }
}

run()
