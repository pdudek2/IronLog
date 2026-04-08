import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'sm' | 'md' | 'lg'
}

const paddingClass = { sm: 'p-4', md: 'p-6 sm:p-8', lg: 'p-8 sm:p-10' }

export default function Card({ padding = 'md', className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`surface-panel rounded-[var(--radius-xl)] ${paddingClass[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
