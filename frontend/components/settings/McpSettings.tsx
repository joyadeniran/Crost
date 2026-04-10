'use client'

import { useState, useEffect } from 'react'
import { supabaseClient } from '@/lib/supabase-browser'
import { toast } from '@/components/ui/toaster'

interface Tool {
  id: string
  label: string
  description: string
  is_configured: boolean
}

export function McpSettings({ initialTools }: { initialTools: Tool[] }) {
  const [tools, setTools] = useState(initialTools)
  const [search, setSearch] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const supabase = supabaseClient

  // Filter tools based on search
  const filteredTools = tools.filter(t =>
    t.label.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  )

  const connectedTools = filteredTools.filter(t => t.is_configured)
  const availableTools = filteredTools.filter(t => !t.is_configured)

  // Synchronize Composio status on mount
  useEffect(() => {
    const syncStatus = async () => {
      setIsSyncing(true)
      try {
        const res = await fetch('/api/connect/sync')
        if (res.ok) {
          const data = await res.json()
          // Update the local tools list with the full list from DB
          if (data.tools) {
            setTools(data.tools)
          } else if (data.synced) {
            // Fallback for legacy sync response
            setTools(prev => prev.map(t => {
              const sync = data.synced.find((s: any) => s.name === t.id)
              return sync ? { ...t, is_configured: sync.isConnected } : t
            }))
          }
        }
      } catch (err) {
        console.error('Initial sync failed:', err)
      } finally {
        setIsSyncing(false)
      }
    }

    syncStatus()
  }, [])

  const handleConnect = async (tool: Tool) => {
    // We now support Composio for all major toolkits
    const supportedProviders = [
      'gmail', 'github', 'slack', 'notion', 'linear',
      'googlecalendar', 'googlesheets', 'googledrive'
    ]
    if (!supportedProviders.includes(tool.id)) {
      window.location.href = `/dashboard/settings/tools/${tool.id}`
      return
    }

    setUpdating(tool.id)

    try {
      // 1. Get User Session (Enforced by Layout, but good to check)
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        toast('Please sign in to connect tools.', 'error', 'Authentication Required')
        return
      }

      // 2. Call Composio Connect API
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, provider: tool.id })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate connection link')
      }

      // 3. Redirect to Composio Managed Auth
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error('No redirect URL provided by Composio')
      }

    } catch (err: any) {
      console.error('Composio Connection Failed:', err)
      toast(err.message || 'Failed to connect. Please try again.', 'error', 'Connection Error')
    } finally {
      setUpdating(null)
    }
  }

  const handleDisconnect = async (tool: Tool) => {
    setUpdating(tool.id)
    try {
      const res = await fetch('/api/settings/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tool.id, is_configured: false })
      })

      if (res.ok) {
        setTools(prev => prev.map(t => t.id === tool.id ? { ...t, is_configured: false } : t))
        toast(`${tool.label} disconnected.`, 'info')
      }
    } catch (err) {
      console.error('Failed to disconnect tool:', err)
      toast('Failed to disconnect. Please try again.', 'error')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <section style={{
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '24px 20px',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ color: 'var(--blue)' }}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M12 2V4M12 20V22M4.93 4.93L6.34 6.34M17.66 17.66L19.07 19.07M2 12H4M20 12H22M6.34 17.66L4.93 19.07M19.07 4.93L17.66 6.34M12 7A5 5 0 1012 17 5 5 0 0012 7Z" />
          </svg>
        </div>
        <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>
          MCP & Tool Connections
        </div>
        {isSyncing && (
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontStyle: 'italic', marginLeft: 'auto' }}>
            Syncing status...
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Search tools (e.g. gmail, slack...)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--bg-3)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
            color: 'var(--text)',
            outline: 'none'
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {tools.length === 0 && !isSyncing && (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            background: 'var(--bg-3)',
            borderRadius: 8,
            border: '1px dashed var(--border)',
            fontSize: 12,
            color: 'var(--text-3)'
          }}>
            No tools found. Please check your Composio API key or try again later.
          </div>
        )}

        {/* Connected Section */}
        {connectedTools.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', letterSpacing: '0.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }}></div>
              CONNECTED TOOLS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {connectedTools.map((tool) => (
                <ToolItem
                  key={tool.id}
                  tool={tool}
                  updating={updating}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                />
              ))}
            </div>
          </div>
        )}

        {/* Available Section */}
        {availableTools.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: 12 }}>
              AVAILABLE INTEGRATIONS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {availableTools.map((tool) => (
                <ToolItem
                  key={tool.id}
                  tool={tool}
                  updating={updating}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                />
              ))}
            </div>
          </div>
        )}

        {search && filteredTools.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-3)', fontSize: 13 }}>
            No tools matching &quot;{search}&quot;
          </div>
        )}
      </div>
    </section>
  )
}

function ToolItem({ tool, updating, onConnect, onDisconnect }: {
  tool: Tool,
  updating: string | null,
  onConnect: (t: Tool) => void,
  onDisconnect: (t: Tool) => void
}) {
  return (
    <div style={{
      background: 'var(--bg-3)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      opacity: updating === tool.id ? 0.6 : 1,
      transition: 'opacity 0.2s'
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{tool.label}</div>
          {tool.is_configured && (
            <span style={{
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 8,
              padding: '1px 5px',
              borderRadius: 4,
              background: 'var(--green-dim)',
              color: 'var(--green)'
            }}>
              ACTIVE
            </span>
          )}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, margin: 0 }}>
          {tool.description}
        </p>
      </div>

      <button
        disabled={updating !== null}
        onClick={() => tool.is_configured ? onDisconnect(tool) : onConnect(tool)}
        style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 10,
          padding: '6px 10px',
          borderRadius: 6,
          border: tool.is_configured ? '1px solid var(--green-dim)' : '1px solid var(--border)',
          background: tool.is_configured ? 'transparent' : 'var(--bg-4)',
          color: tool.is_configured ? 'var(--green)' : 'var(--text-2)',
          cursor: updating ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          minWidth: 85
        }}
      >
        {updating === tool.id ? '...' : (tool.is_configured ? 'DISCONNECT' : 'CONNECT')}
      </button>
    </div>
  )
}
