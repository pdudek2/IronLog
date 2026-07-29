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
  'M-20 190C40 190 72 190 94 184C112 178 120 158 132 132C146 102 162 82 184 84C208 86 218 116 230 150C240 178 252 190 278 190C314 190 332 184 346 158C364 124 374 66 402 58C430 50 444 102 458 150C468 180 480 190 506 190C542 190 558 182 574 154C592 120 606 92 628 94C650 96 662 128 674 158C686 182 700 190 724 190C758 190 776 184 790 162C808 136 818 112 840 114C864 116 874 146 886 168C896 184 908 190 930 190C960 190 976 184 990 166C1004 148 1016 132 1034 134C1054 136 1062 158 1074 174C1086 188 1098 190 1116 188C1148 186 1178 180 1220 176'

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
            <span className="sr-only">Trening ma swój rytm.</span>
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
            Następna seria zaczyna się od poprzedniej.
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
