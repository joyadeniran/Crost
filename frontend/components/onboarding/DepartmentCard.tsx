'use client'

interface DepartmentCardProps {
  name: string
  slug: string
  description: string
  modelLabel: string
  selected: boolean
  onClick: () => void
}

export function DepartmentCard({ name, description, modelLabel, selected, onClick }: DepartmentCardProps) {
  return (
    <div 
      className={`dept-card glass-panel ${selected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="dept-header">
        <h3 className="dept-name">{name}</h3>
        <div className="selection-indicator">
          {selected ? '✓' : '+'}
        </div>
      </div>
      <div className="dept-divider"></div>
      <p className="dept-desc">{description}</p>
      
      <div className="dept-footer">
        <span className="model-badge">{modelLabel}</span>
        <span className="dept-footer-secondary">{selected ? 'Selected' : 'Add later'}</span>
      </div>
    </div>
  )
}
