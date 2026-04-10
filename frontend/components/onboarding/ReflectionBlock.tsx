'use client'

import { useState, useEffect } from 'react'

export function ReflectionBlock({ text, delay = 0, onEdit }: { text: string; delay?: number; onEdit?: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  if (!text || !visible) return null

  return (
    <div className="reflection-block animate-fade-in">
      <div className="reflection-content">
        <span className="reflection-icon">✦</span>
        <span className="reflection-text">{text}</span>
        {onEdit && (
          <button type="button" onClick={onEdit} className="reflection-edit-btn">Edit</button>
        )}
      </div>
    </div>
  )
}
