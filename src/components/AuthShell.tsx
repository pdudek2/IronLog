import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Dumbbell, Sparkles, TrendingUp } from 'lucide-react'

interface AuthShellProps {
  title: string
  subtitle: ReactNode
  children: ReactNode
}

const FEATURES = [
  {
    icon: Dumbbell,
    title: 'Szybkie logowanie treningu',
    description: 'Dodawaj serie w kilka sekund i utrzymuj rytm sesji.',
  },
  {
    icon: TrendingUp,
    title: 'Historia i progres',
    description: 'Wracaj do sesji, objętości i rekordów bez szukania po aplikacji.',
  },
  {
    icon: Sparkles,
    title: 'Trener AI',
    description: 'Architektura gotowa pod kontekst treningowy i rekomendacje.',
  },
] as const

export default function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="page-shell flex items-center">
      <div className="page-container grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] lg:items-center">
        <motion.section
          className="surface-panel hidden overflow-hidden rounded-[var(--radius-xl)] p-8 lg:block xl:p-10"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="mb-10 flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)]"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-soft-strong)' }}
            >
              <Dumbbell size={20} />
            </div>
            <div>
              <p className="text-lg font-bold text-white">IronLog</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Dziennik siłowy z inteligentnym coachingiem
              </p>
            </div>
          </div>

          <div className="mb-10 max-w-xl">
            <p className="eyebrow mb-3" style={{ color: 'var(--accent)' }}>
              Performance intelligence
            </p>
            <h2 className="text-4xl font-bold leading-tight text-white xl:text-5xl">
              Loguj treningi szybko. Oglądaj progres jak produkt premium.
            </h2>
            <p className="mt-4 max-w-lg text-base leading-7" style={{ color: 'var(--muted)' }}>
              Fundament pod historię, metryki, analitykę i inteligentne rekomendacje bez wrażenia surowego narzędzia.
            </p>
          </div>

          <div className="mb-6 grid gap-3 xl:grid-cols-3">
            {[
              { label: 'Objętość', value: '24 600 kg' },
              { label: 'Sesje', value: '4 / tydz.' },
              { label: 'Trend', value: '+12%' },
            ].map((item) => (
              <div
                key={item.label}
                className="metric-card p-4"
              >
                <p className="stat-meta">{item.label}</p>
                <p className="mt-3 text-2xl font-bold tracking-[-0.05em] text-white tabular-nums">
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title: featureTitle, description }) => (
              <div
                key={featureTitle}
                className="rounded-[var(--radius-lg)] border p-4"
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderColor: 'var(--border)',
                }}
              >
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)]"
                  style={{ background: 'rgba(90, 166, 255, 0.12)', color: 'var(--accent)' }}
                >
                  <Icon size={18} />
                </div>
                <p className="mb-2 text-sm font-semibold text-white">{featureTitle}</p>
                <p className="text-sm leading-6" style={{ color: 'var(--muted)' }}>
                  {description}
                </p>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section
          className="surface-panel mx-auto w-full max-w-md rounded-[var(--radius-xl)] p-6 sm:p-8"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="mb-10">
            <span className="text-2xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
              IronLog
            </span>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">{title}</h1>
            <div className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
              {subtitle}
            </div>
          </div>

          {children}
        </motion.section>
      </div>
    </div>
  )
}
