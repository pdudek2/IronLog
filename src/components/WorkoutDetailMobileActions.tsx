import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface WorkoutDetailMobileActionsProps {
  children: ReactNode
}

export function WorkoutDetailMobileActions({ children }: WorkoutDetailMobileActionsProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const [fixed, setFixed] = useState(false)

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return
      const nextFixed = !entry.isIntersecting && entry.boundingClientRect.top < 0
      setFixed(nextFixed)
    })

    observer.observe(anchor)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="workout-detail-mobile-actions-slot lg:hidden">
      <div
        ref={anchorRef}
        className="workout-detail-mobile-actions-anchor"
        aria-hidden="true"
      />
      <div
        role="group"
        aria-label="Akcje treningu"
        className="workout-detail-mobile-actions"
        data-placement={fixed ? 'fixed' : 'inline'}
      >
        <div className="workout-detail-mobile-actions-inner">
          {children}
        </div>
      </div>
    </div>
  )
}
