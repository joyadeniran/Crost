'use client'

import React, { useState, useEffect, useCallback } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  title?: string
  message: string
  type: ToastType
  duration?: number
}

let toastCount = 0
const subscribers = new Set<(toasts: Toast[]) => void>()
let toasts: Toast[] = []

const notify = () => {
  subscribers.forEach(sub => sub([...toasts]))
}

export const toast = (message: string, type: ToastType = 'info', title?: string, duration = 5000) => {
  const id = `toast-${toastCount++}`
  const newToast: Toast = { id, message, type, title, duration }
  toasts.push(newToast)
  notify()

  if (duration !== Infinity) {
    setTimeout(() => {
      dismiss(id)
    }, duration)
  }
  return id
}

export const dismiss = (id: string) => {
  toasts = toasts.filter(t => t.id !== id)
  notify()
}

export function useToast() {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>([])

  useEffect(() => {
    subscribers.add(setCurrentToasts)
    return () => {
      subscribers.delete(setCurrentToasts)
    }
  }, [])

  return { toasts: currentToasts, toast, dismiss }
}

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      pointerEvents: 'none'
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            minWidth: 320,
            maxWidth: 420,
            background: 'var(--bg-2)',
            border: '1px solid var(--border-bright)',
            borderRadius: 'var(--radius)',
            padding: '16px 20px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            pointerEvents: 'auto',
            animation: 'crost-fade-in 0.3s ease',
            position: 'relative',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Icon */}
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            marginTop: 6,
            background: t.type === 'success' ? 'var(--green)' : 
                        t.type === 'error' ? 'var(--red)' : 
                        t.type === 'warning' ? 'var(--amber)' : 'var(--blue)',
            boxShadow: `0 0 10px ${t.type === 'success' ? 'var(--green)' : 
                        t.type === 'error' ? 'var(--red)' : 
                        t.type === 'warning' ? 'var(--amber)' : 'var(--blue)'}40`
          }} />

          <div style={{ flex: 1 }}>
            {t.title && (
              <div style={{ 
                fontFamily: 'var(--font-syne, Syne)', 
                fontWeight: 700, 
                fontSize: 13, 
                color: 'var(--text)',
                marginBottom: 4 
              }}>
                {t.title}
              </div>
            )}
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.4 }}>
              {t.message}
            </div>
          </div>

          <button
            onClick={() => dismiss(t.id)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-3)',
              cursor: 'pointer',
              padding: 0,
              fontSize: 18,
              lineHeight: 1,
              marginTop: -4
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
