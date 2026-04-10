'use client'

import { useState, useEffect } from 'react'

interface ProgressLineProps {
  label: string
  status: string
  duration: number
  onComplete?: () => void
}

export function ProgressLine({ label, status, duration, onComplete }: ProgressLineProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const step = 100 / (duration / 50)
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          onComplete?.()
          return 100
        }
        return prev + step
      })
    }, 50)
    return () => clearInterval(interval)
  }, [duration, onComplete])

  return (
    <div className="progress-line">
      <div className="line-text">
        <span className="label">{label}</span>
        <span className="dots"></span>
        <span className="status">{status}</span>
      </div>
      <div className="progress-bar-bg">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
      </div>

      <style jsx>{`
        .progress-line {
          margin-bottom: 24px;
        }

        .line-text {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
          font-family: var(--font-dm-mono), monospace;
          font-size: 13px;
        }

        .label {
          color: rgba(255,255,255,0.8);
          min-width: 120px;
        }

        .dots {
          flex-grow: 1;
          border-bottom: 1px dotted rgba(255,255,255,0.1);
          margin: 0 12px;
        }

        .status {
          color: rgba(255,255,255,0.4);
          text-align: right;
          min-width: 140px;
        }

        .progress-bar-bg {
          height: 6px;
          background: rgba(255,255,255,0.05);
          border-radius: 3px;
          overflow: hidden;
        }

        .progress-bar-fill {
          height: 100%;
          background: #1D9E75;
          box-shadow: 0 0 10px rgba(29, 158, 117, 0.3);
          transition: width 0.1s linear;
        }
      `}</style>
    </div>
  )
}
