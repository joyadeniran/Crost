import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function debugInsert() {
  console.log('Testing tool_executions insert...')
  
  // Get a valid user
  const { data: user } = await supabase.from('auth.users').select('id').limit(1).single()
  if (!user) {
    console.error('No user found to test with')
    return
  }

  const testInsert = {
    user_id: user.id,
    goal_id: null,
    task_id: '00000000-0000-0000-0000-000000000000',
    department_slug: 'executive',
    tool_slug: 'gmail',
    action: 'search_emails',
    params: { q: 'test' },
    status: 'running',
    risk: 'low',
    requires_approval: false
  }

  const { data, error } = await supabase
    .from('tool_executions')
    .insert(testInsert)
    .select()

  if (error) {
    console.error('Insert failed with error:', JSON.stringify(error, null, 2))
  } else {
    console.log('Insert succeeded:', data)
  }
}

debugInsert()
