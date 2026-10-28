import type { CSSProperties, ReactNode } from 'react'

// A page's loading placeholder in the page's own layout classes, so content lands where the blocks were.
// The label is the status for assistive tech; the blocks themselves are hidden from it.
export function PageSkeleton({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <>
      <span className="sr-only" role="status">{label}</span>
      <div className={className ? `page-skeleton ${className}` : 'page-skeleton'} aria-hidden="true">
        {children}
      </div>
    </>
  )
}

// One shimmering block; it fades in only after 200 ms (index.css), so quick loads never flash it.
// Without a width it fills its row, or takes the width a page class gives it.
export function Bone({ width, height, className, style }: { width?: string; height: string; className?: string; style?: CSSProperties }) {
  return <span className={className ? `skeleton-bone ${className}` : 'skeleton-bone'} style={{ width, height, ...style }} />
}
