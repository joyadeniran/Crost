import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env' });

async function run() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users.users.find(u => u.email === 'joy@supplya.shop') || users.users[0];
  
  const { data: aq, error: aqErr } = await supabase
    .from('approval_queue')
    .select('*')
    .eq('id', 'e207ad9c-503f-4615-9f09-3abc04a0c420')
    .limit(1);
    
  console.log("Approval Queue Result:", JSON.stringify(aq, null, 2), "Error:", aqErr);

  const { data: el } = await supabase
    .from('event_log')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(3);
    
  console.log("Recent Events:", JSON.stringify(el, null, 2));
}
run();