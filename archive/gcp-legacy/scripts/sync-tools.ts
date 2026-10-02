
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function setupTools() {
  console.log('--- Syncing Available Tools ---')

  const tools = [
    {
      id: 'comm_drafts',
      label: 'Gmail / WhatsApp Draft',
      description: 'Draft emails and WhatsApp messages — never sends without approval',
      requires_config: true,
      risk_level: 'medium'
    }
  ]

  for (const tool of tools) {
    const { error } = await supabase
      .from('available_tools')
      .upsert(tool, { onConflict: 'id' })
    
    if (error) {
      console.error(`Error syncing tool ${tool.id}:`, error)
    } else {
      console.log(`Synced tool: ${tool.label}`)
    }
  }

  console.log('Done.')
}

setupTools()
