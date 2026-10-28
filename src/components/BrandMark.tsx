import { BRAND_MARK } from '../shared/brandMark'

// Halves take the parent's text colour; the cut is the accent.
export default function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox={BRAND_MARK.viewBox} aria-hidden="true" focusable="false">
      <path d={BRAND_MARK.upper} fill="currentColor" />
      <rect {...BRAND_MARK.cut} style={{ fill: 'var(--accent)' }} />
      <path d={BRAND_MARK.lower} fill="currentColor" />
    </svg>
  )
}
