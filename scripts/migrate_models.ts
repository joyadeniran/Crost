import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: 'frontend/.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function migrateModels() {
  const { data: depts, error } = await supabase
    .from('departments')
    .select('id, name, model_name')

  if (error) {
    console.error('Error fetching departments:', error)
    return
  }

  console.log('Current departments and models:')
  depts.forEach(d => console.log(`- ${d.name}: ${d.model_name}`))

  const deprecated = 'groq/llama3-70b-8192'
  const replacement = 'groq/llama-3.3-70b-versatile'

  const { error: updateError } = await supabase
    .from('departments')
    .update({ model_name: replacement })
    .eq('model_name', deprecated)

  if (updateError) {
    console.error('Error updating departments:', updateError)
  } else {
    console.log(`Successfully migrated all departments from ${deprecated} to ${replacement}`)
  }
}

migrateModels()
