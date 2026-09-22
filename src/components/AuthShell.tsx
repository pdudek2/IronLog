import type { ReactNode } from 'react'

interface AuthShellProps {
  title: string
  subtitle: ReactNode
  children: ReactNode
}

const HEADLINE_LINES = [
  ['Find', 'your'],
  ['training', 'rhythm.'],
]

import { SIGNAL_PATH } from '../shared/authVisual'

export default function AuthShell({ title, subtitle, children }: AuthShellProps) {
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
          <path className="auth-signal-trace auth-signal-trace--echo" d={SIGNAL_PATH} pathLength={1} fill="none" />
          <path className="auth-signal-trace auth-signal-trace--lead" d={SIGNAL_PATH} pathLength={1} fill="none" />
        </svg>
      </div>

      <header className="auth-instrument-header">
        <div className="auth-instrument-brand">
          <span className="auth-instrument-mark">
            IL
          </span>
          <span>IronLog</span>
        </div>
      </header>

      <main className="auth-instrument-main">
        <section className="auth-instrument-hero">
          <p className="auth-instrument-title">
            <span className="sr-only">Find your training rhythm.</span>
            {HEADLINE_LINES.map((line, lineIndex) => (
              <span key={lineIndex} className="auth-title-line" aria-hidden="true">
                {line.map((word) => (
                  <span key={word} className="auth-title-word">
                    <span className="auth-title-word-inner">
                      {word}
                    </span>
                  </span>
                ))}
              </span>
            ))}
          </p>

          <p className="auth-instrument-copy">
            Every set builds on the last.
          </p>
        </section>

        <section className="auth-instrument-form-wrap">
          <div className="auth-instrument-form-panel">
            <div className="auth-instrument-form-heading">
              <h1>{title}</h1>
              <div>
                {subtitle}
              </div>
            </div>

            {children}
          </div>
        </section>
      </main>
    </div>
  )
}
