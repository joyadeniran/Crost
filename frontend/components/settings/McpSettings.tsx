'use client'

import { useState } from 'react'

interface Tool {
  id: string
  label: string
  description: string
  is_configured: boolean
}

export function McpSettings({ initialTools }: { initialTools: Tool[] }) {
  const [tools, setTools] = useState(initialTools)

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
            <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41m12.72-12.72l-1.41 1.41M12 7a5 5 0 100 10 5 5 0 000-10z" />
          </svg>
        </div>
        <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>
          MCP & Tool Connections
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tools.map((tool) => (
          <div key={tool.id} style={{ 
            background: 'var(--bg-3)', 
            border: '1px solid var(--border)', 
            borderRadius: 8, 
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{tool.label}</div>
                <span style={{ 
                  fontFamily: 'var(--font-dm-mono, monospace)', 
                  fontSize: 9, 
                  padding: '1px 6px', 
                  borderRadius: 4, 
                  background: tool.is_configured ? 'var(--green-dim)' : 'var(--bg-4)',
                  color: tool.is_configured ? 'var(--green)' : 'var(--text-3)'
                }}>
                  {tool.is_configured ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, margin: 0 }}>
                {tool.description}
              </p>
            </div>
            <button
              style={{
                fontFamily: 'var(--font-dm-mono, monospace)',
                fontSize: 11,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-4)',
                color: 'var(--text-2)',
                cursor: 'pointer'
              }}
            >
              {tool.is_configured ? 'MANAGE' : 'CONFIGURE'}
            </button>
          </div>
        ))}

        <div style={{
          marginTop: 8,
          padding: '16px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed var(--border)',
          borderRadius: 8,
          textAlign: 'center',
          cursor: 'pointer'
        }}>
          <div style={{ fontSize: 18, marginBottom: 4 }}>🔌</div>
          <div style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 11, color: 'var(--text-3)' }}>
            + CONNECT NEW MCP SERVICE
          </div>
        </div>
      </div>
    </section>
  )
}
