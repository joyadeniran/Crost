'use client'

interface DepartmentCardProps {
  name: string
  slug: string
  description: string
  selected: boolean
  onClick: () => void
}

export function DepartmentCard({ name, description, selected, onClick }: DepartmentCardProps) {
  return (
    <div 
      className={`dept-card ${selected ? 'selected' : ''}`}
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
        <span className="model-badge">○ Cloud Optimizer</span>
      </div>


    </div>
  )
}
