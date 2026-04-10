'use client'

interface ControlStyleCardProps {
  id: 'careful' | 'balanced' | 'aggressive'
  title: string
  description: string
  details: string
  selected: boolean
  onClick: () => void
}

export function ControlStyleCard({ id, title, description, details, selected, onClick }: ControlStyleCardProps) {
  return (
    <div 
      className={`control-card ${selected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="card-selection-marker">
        {selected && <div className="dot"></div>}
      </div>
      <div className="card-content">
        <h3 className="card-title">{title}</h3>
        <p className="card-desc">{description}</p>
        <p className="card-details">{details}</p>
      </div>


    </div>
  )
}
