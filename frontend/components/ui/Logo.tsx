import React from 'react'

export function Logo({ size = 32, className = '' }: { size?: number, className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 1000 1000" 
      className={className}
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        fillRule="evenodd" 
        clipRule="evenodd" 
        fill="#00D4AA" 
        d="M199.1 0h600.9C910.457 0 1000 89.543 1000 199.1v600.9c0 110.457-89.543 200-199.1 200H199.1C89.543 1000 0 910.457 0 800V199.1C0 89.543 89.543 0 199.1 0z"
      />
      <path 
        fillRule="evenodd" 
        clipRule="evenodd" 
        fill="#09090D" 
        d="M402.788 812.1L230 636.97V363.393L401.912 188h368.188v141.329H460.901L367.089 425.615v152.151l93.812 93.812 309.199 1.881V812.1H402.788zM460.1 431h310v140.1h-310V431z"
      />
    </svg>
  )
}
