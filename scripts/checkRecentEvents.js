// scripts/checkRecentEvents.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'frontend/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('event_log')
    .select('event_type, description, created_at')
    .gte('created_at', tenMinsAgo)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching events:', error);
  } else {
    console.log(`Found ${data.length} events in the last 10 minutes:`);
    data.forEach(e => console.log(`[${e.created_at}] ${e.event_type}: ${e.description}`));
  }
}

main();
