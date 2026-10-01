// scripts/updateOrcColor.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'frontend/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data, error } = await supabase
    .from('departments')
    .update({ color: '#a855f7', icon: 'command' })
    .eq('slug', 'orchestrator')
    .select();

  if (error) {
    console.error('Error updating Orc color:', error);
  } else {
    console.log('Orchestrator color updated to #a855f7 (Violet):', data);
  }
}

main();
