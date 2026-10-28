import { useId } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { BRAND_MARK, BRAND_MARK_SLIP } from '../shared/brandMark'

const { times, offsets, ease, slipAt, loopPause, seam, clip } = BRAND_MARK_SLIP
const end = times[times.length - 1]

// Halves take the parent's text colour; the cut is the accent.
// `slip` plays the stick-slip once, or on repeat for loaders; reduced motion keeps the static mark.
export default function BrandMark({ className, slip }: { className?: string; slip?: 'once' | 'loop' }) {
  const reduceMotion = useReducedMotion()
  const clipId = useId()

  if (!slip || reduceMotion) {
    return (
      <svg className={className} viewBox={BRAND_MARK.viewBox} aria-hidden="true" focusable="false">
        <path d={BRAND_MARK.upper} fill="currentColor" />
        <rect {...BRAND_MARK.cut} style={{ fill: 'var(--accent)' }} />
        <path d={BRAND_MARK.lower} fill="currentColor" />
      </svg>
    )
  }

  const repeat = slip === 'loop' ? { repeat: Infinity, repeatDelay: loopPause / 1000 } : {}
  const slide = {
    initial: { x: offsets[0] },
    animate: { x: [...offsets] },
    transition: { duration: end / 1000, times: times.map((ms) => ms / end), ease: [...ease], ...repeat },
  }
  const seamCover = {
    initial: { opacity: 1 },
    animate: { opacity: [1, 1, 0, 0] },
    transition: { duration: end / 1000, times: [0, slipAt / end, (slipAt + 1) / end, 1], ease: 'linear' as const, ...repeat },
  }

  // Visible overflow keeps the tremor and the overshoot past the box edges.
  return (
    <svg className={className} viewBox={BRAND_MARK.viewBox} aria-hidden="true" focusable="false" style={{ overflow: 'visible' }}>
      <clipPath id={clipId}>
        <rect x={clip.x} y={272} width={clip.width} height={480} />
      </clipPath>
      <path d={BRAND_MARK.lower} fill="currentColor" />
      <g clipPath={`url(#${clipId})`}>
        <motion.g {...slide}>
          <rect {...seam} style={{ fill: 'var(--accent)' }} />
          {/* Overlaps the halves by half a seam so the whole block shows no antialiased hairline. */}
          <motion.rect x={seam.x} y={seam.y - seam.height / 2} width={seam.width} height={seam.height * 2} fill="currentColor" {...seamCover} />
        </motion.g>
      </g>
      <motion.path d={BRAND_MARK.upper} fill="currentColor" {...slide} />
    </svg>
  )
}
