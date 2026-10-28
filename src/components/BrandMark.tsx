import { useId } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { BRAND_MARK, BRAND_MARK_SLIP } from '../shared/brandMark'

const { times, offsets, ease, cover, red, seam, clip } = BRAND_MARK_SLIP
const end = times[times.length - 1]

// Halves take the parent's text colour; the cut is the accent.
// `slip` plays the slip once, for a moment like a new record; reduced motion keeps the static mark.
export default function BrandMark({ className, slip = false }: { className?: string; slip?: boolean }) {
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

  const slide = {
    initial: { x: offsets[0] },
    animate: { x: [...offsets] },
    transition: { duration: end / 1000, times: times.map((ms) => ms / end), ease: [...ease] },
  }
  const fade = (track: { times: readonly number[]; opacity: readonly number[] }) => ({
    initial: { opacity: track.opacity[0] },
    animate: { opacity: [...track.opacity] },
    transition: { duration: end / 1000, times: track.times.map((ms) => ms / end), ease: 'linear' as const },
  })
  const seamCover = fade(cover)
  const seamRed = fade(red)

  return (
    <svg className={className} viewBox={BRAND_MARK.viewBox} aria-hidden="true" focusable="false">
      <clipPath id={clipId}>
        <rect x={clip.x} y={272} width={clip.width} height={480} />
      </clipPath>
      <path d={BRAND_MARK.lower} fill="currentColor" />
      <g clipPath={`url(#${clipId})`}>
        <motion.g {...slide}>
          <motion.rect {...seam} style={{ fill: 'var(--accent)' }} {...seamRed} />
          {/* Overlaps the halves by half a seam so the whole block shows no antialiased hairline. */}
          <motion.rect x={seam.x} y={seam.y - seam.height / 2} width={seam.width} height={seam.height * 2} fill="currentColor" {...seamCover} />
        </motion.g>
      </g>
      <motion.path d={BRAND_MARK.upper} fill="currentColor" {...slide} />
    </svg>
  )
}
