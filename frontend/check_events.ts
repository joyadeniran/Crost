import { createClient } from '@supabase/supabase-client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function check() {
  const { data, error } = await supabase
    .from('event_log')
    .select('*')
    .eq('department_slug', 'engineering')
    .order('created_at', { ascending: false })
    .limit(5)
  
  if (error) {
    console.error(error)
  } else {
    console.log(JSON.stringify(data, null, 2))
  }
}

check()
