'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Tool {
  id: string
  label: string
  description: string
  config: Record<string, any>
  is_configured: boolean
}

const CONFIG_FIELDS: Record<string, Array<{ key: string; label: string; type: string; placeholder: string }>> = {
  github: [
    { key: 'api_key', label: 'GitHub Personal Access Token', type: 'password', placeholder: 'ghp_...' },
    { key: 'owner', label: 'Repo Owner (User or Org)', type: 'text', placeholder: 'e.g. crost-labs' },
    { key: 'repo', label: 'Repository Name', type: 'text', placeholder: 'e.g. main-app' },
  ],
  gmail: [
    { key: 'api_key', label: 'Google API Key', type: 'password', placeholder: 'AIza...' },
    { key: 'user_email', label: 'Authorized Email', type: 'email', placeholder: 'founder@example.com' },
  ],
  slack: [
    { key: 'bot_token', label: 'Slack Bot Token', type: 'password', placeholder: 'xoxb-...' },
    { key: 'default_channel', label: 'Default Channel ID', type: 'text', placeholder: 'C01234567' },
  ],
  apollo_mcp: [
    { key: 'api_key', label: 'Apollo.io API Key', type: 'password', placeholder: '...' },
  ],
  supabase_query: [
    { key: 'connection_string', label: 'Connection String (Read-only)', type: 'password', placeholder: 'postgresql://...' },
  ],
  comm_drafts: [
    { key: 'whatsapp_number', label: 'WhatsApp Business Number', type: 'text', placeholder: '+1...' },
    { key: 'verify_token', label: 'Verification Token', type: 'password', placeholder: '...' },
  ]
}

export default function ToolConfigPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [tool, setTool] = useState<Tool | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<Record<string, string>>({})

  useEffect(() => {
    async function fetchTool() {
      // In a real app, this would be an API call
      // For now, we'll fetch from a generic 'get_tool' endpoint or use the client supabase
      setLoading(false)
    }
    fetchTool()
  }, [params.id])

  const fields = CONFIG_FIELDS[params.id] || []

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    try {
      const res = await fetch('/api/settings/tools/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: params.id,
          config: formData,
          is_configured: true
        })
      })
      
      if (res.ok) {
        router.push('/dashboard/settings')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-3)' }}>Loading configuration...</div>

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px' }}>
      <button 
        onClick={() => router.back()}
        style={{ 
          background: 'none', 
          border: 'none', 
          color: 'var(--text-3)', 
          fontSize: 12, 
          cursor: 'pointer',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        ← Back to Settings
      </button>

      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-syne, Syne)', fontSize: 28, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
          Configure {params.id.charAt(0).toUpperCase() + params.id.slice(1).replace('_', ' ')}
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 14 }}>
          Enter your credentials to enable this connector. Data is stored securely.
        </p>
      </div>

      <form onSubmit={handleSave} style={{ 
        background: 'var(--bg-2)', 
        border: '1px solid var(--border)', 
        borderRadius: 'var(--radius)', 
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 20
      }}>
        {fields.length > 0 ? (
          fields.map(field => (
            <div key={field.key}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-2)', marginBottom: 8 }}>
                {field.label}
              </label>
              <input
                type={field.type}
                placeholder={field.placeholder}
                value={formData[field.key] || ''}
                onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                required
                style={{
                  width: '100%',
                  background: 'var(--bg-3)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  color: 'var(--text)',
                  fontSize: 14,
                  outline: 'none',
                  fontFamily: field.type === 'password' ? 'initial' : 'var(--font-dm-sans)'
                }}
              />
            </div>
          ))
        ) : (
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>No configuration required for this tool. Click &quot;Activate&quot; to enable.</p>
        )}

        <button
          type="submit"
          disabled={saving}
          style={{
            marginTop: 12,
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '14px',
            fontSize: 14,
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
            transition: 'all 0.2s'
          }}
        >
          {saving ? 'SAVING CONFIG...' : 'SAVE & CONNECT'}
        </button>
      </form>
    </div>
  )
}
