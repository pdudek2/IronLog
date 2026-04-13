import { motion } from 'framer-motion'
import BottomNav from './BottomNav'

/**
 * Suspense fallback that keeps the nav visible during lazy route loading.
 * Prevents the AppShell from disappearing between page transitions.
 */
export default function ShellSkeleton() {
  return (
    <div className="page-shell">
      <div className="page-container app-shell-grid">
        <aside className="desktop-rail" aria-hidden="true">
          <div className="desktop-rail-panel">
            <div
              className="h-14 w-full animate-pulse rounded-[var(--radius-lg)]"
              style={{ background: 'rgba(90,166,255,0.08)' }}
            />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-[var(--radius-lg)]"
                  style={{ height: '3.5rem', background: 'rgba(255,255,255,0.03)' }}
                />
              ))}
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 items-center justify-center" style={{ minHeight: '60dvh' }}>
          <motion.div
            className="h-11 w-11 rounded-[var(--radius-md)]"
            style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-strong)' }}
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, ease: 'linear', duration: 1.4 }}
          />
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
