'use client'

import React from 'react'

interface ConfirmationModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  isDanger?: boolean
}

/**
 * A branded Crost confirmation modal.
 * Replaces native browser window.confirm() dialogs.
 */
export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isDanger = false
}: ConfirmationModalProps) {
  if (!isOpen) return null

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 11000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
      }}
      className="crost-fade-in"
      onClick={onCancel}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'var(--bg-2)',
          border: '1px solid var(--border-bright)',
          borderRadius: 'var(--radius)',
          padding: '28px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          position: 'relative',
        }}
      >
        <h3 style={{
          fontFamily: 'var(--font-syne, Syne)',
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--text)',
          marginBottom: 12,
          letterSpacing: '-0.01em'
        }}>
          {title}
        </h3>
        <p style={{
          fontSize: 14,
          color: 'var(--text-2)',
          lineHeight: 1.6,
          marginBottom: 32
        }}>
          {message}
        </p>
        
        <div style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-3)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontFamily: 'var(--font-dm-sans, sans-serif)'
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: 'none',
              background: isDanger ? 'var(--red)' : 'var(--accent)',
              color: isDanger ? '#fff' : '#000',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: `0 0 20px ${isDanger ? 'var(--red)' : 'var(--accent)'}30`,
              transition: 'all 0.2s',
              fontFamily: 'var(--font-dm-sans, sans-serif)'
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
