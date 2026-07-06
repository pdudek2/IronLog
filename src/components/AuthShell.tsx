import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

interface AuthShellProps {
  title: string
  subtitle: ReactNode
  children: ReactNode
}

const HEADLINE_LINES = [
  ['Trening', 'ma'],
  ['swój', 'rytm.'],
]

const SIGNAL_PATH =
  'M-20 190H70Q90 190 98 176L122 132Q128 122 140 122H188Q200 122 206 136L224 176Q232 190 252 190H320Q340 190 348 172L378 96Q384 84 396 84H448Q460 84 466 100L490 172Q498 190 518 190H586Q606 190 614 168L650 58Q656 46 668 46H716Q728 46 734 64L762 168Q770 190 790 190H858Q878 190 886 174L906 130Q912 120 924 120H964Q976 120 982 134L1000 176Q1008 190 1028 190H1080Q1096 190 1102 180L1112 166Q1118 158 1126 158H1150Q1158 158 1162 166L1172 182Q1178 190 1188 190H1220'

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

export default function AuthShell({ title, subtitle, children }: AuthShellProps) {
  const reducedMotion = useReducedMotion()

  return (
    <div className="auth-instrument-shell">
      <div className="auth-signal" aria-hidden="true">
        <svg viewBox="0 0 1200 240" preserveAspectRatio="none" focusable="false">
          <defs>
            <linearGradient id="auth-signal-stroke" x1="0" y1="46" x2="0" y2="196" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#ff7182" />
              <stop offset="0.52" stopColor="#f0435a" />
              <stop offset="1" stopColor="#8fb8a0" />
            </linearGradient>
            <linearGradient id="auth-signal-fill" x1="0" y1="46" x2="0" y2="240" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#f0435a" stopOpacity="0.15" />
              <stop offset="1" stopColor="#f0435a" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="auth-signal-area" d={`${SIGNAL_PATH}V240H-20Z`} fill="url(#auth-signal-fill)" />
          <path className="auth-signal-base" d={SIGNAL_PATH} pathLength={1} fill="none" stroke="url(#auth-signal-stroke)" />
          <path className="auth-signal-trace" d={SIGNAL_PATH} pathLength={1} fill="none" />
        </svg>
      </div>

      <header className="auth-instrument-header">
        <div className="auth-instrument-brand">
          <span className="auth-instrument-mark">
            IL
          </span>
          <span>IronLog</span>
        </div>

        <span className="auth-instrument-header-note">
          Sesja · plan · historia · coach
        </span>
      </header>

      <main className="auth-instrument-main">
        <section className="auth-instrument-hero">
          <p className="auth-instrument-kicker">IronLog</p>

          <h2 className="auth-instrument-title" aria-label="Trening ma swój rytm.">
            {HEADLINE_LINES.map((line, lineIndex) => (
              <span key={lineIndex} className="auth-title-line" aria-hidden="true">
                {line.map((word, wordIndex) => (
                  <span key={word} className="auth-title-word">
                    <motion.span
                      className="auth-title-word-inner"
                      initial={reducedMotion ? false : { y: '112%' }}
                      animate={{ y: '0%' }}
                      transition={{
                        duration: 0.7,
                        delay: 0.16 + (lineIndex * 2 + wordIndex) * 0.085,
                        ease: EASE_OUT,
                      }}
                    >
                      {word}
                    </motion.span>
                  </span>
                ))}
              </span>
            ))}
          </h2>

          <motion.p
            className="auth-instrument-copy"
            initial={reducedMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.52, ease: EASE_OUT }}
          >
            Sesja, plan, historia, gotowość i coach w jednym miejscu. Bez notatek obok i bez arkusza po treningu.
          </motion.p>
        </section>

        <motion.section
          className="auth-instrument-form-wrap"
          initial={reducedMotion ? false : { opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.34, ease: EASE_OUT }}
        >
          <div className="auth-instrument-form-panel">
            <div className="auth-instrument-form-heading">
              <span className="auth-instrument-form-brand">
                IronLog
              </span>
              <h1>{title}</h1>
              <div>
                {subtitle}
              </div>
            </div>

            {children}
          </div>
        </motion.section>
      </main>
    </div>
  )
}
