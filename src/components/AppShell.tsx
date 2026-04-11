import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Dumbbell, LayoutDashboard, Layers3, LogOut, Plus, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { logoutUser } from '../lib/auth'
import BottomNav from './BottomNav'

type AppSection = 'dashboard' | 'templates' | 'exercises' | 'profile' | 'progress'

interface AppShellProps {
  current?: AppSection
  bottomNav?: boolean
  children: ReactNode
}

const NAV_ITEMS: Array<{
  key: AppSection
  label: string
  icon: typeof LayoutDashboard
  to: string
}> = [
  { key: 'dashboard', label: 'Start', icon: LayoutDashboard, to: '/dashboard' },
  { key: 'templates', label: 'Plany', icon: Layers3, to: '/templates' },
  { key: 'exercises', label: 'Ćwiczenia', icon: Dumbbell, to: '/exercises' },
  { key: 'profile', label: 'Profil', icon: User, to: '/profile' },
]

export default function AppShell({
  current,
  bottomNav = true,
  children,
}: AppShellProps) {
  const navigate = useNavigate()

  return (
    <div className="page-shell">
      <div className="page-container app-shell-grid">
        <aside className="desktop-rail" aria-label="Główna nawigacja">
          <div className="desktop-rail-panel">
            <div
              className="flex h-14 w-full items-center justify-center rounded-[var(--radius-lg)] border"
              style={{
                borderColor: 'var(--border)',
                background: 'linear-gradient(180deg, rgba(90,166,255,0.16) 0%, rgba(90,166,255,0.06) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)]"
                style={{
                  background: 'var(--accent-soft)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent-soft-strong)',
                }}
              >
                <Dumbbell size={18} />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {NAV_ITEMS.map(({ key, label, icon: Icon, to }) => (
                <motion.button
                  key={key}
                  onClick={() => navigate(to)}
                  className="desktop-rail-button"
                  data-active={current === key}
                  whileTap={{ scale: 0.94 }}
                  title={label}
                  aria-current={current === key ? 'page' : undefined}
                  aria-label={label}
                >
                  <Icon size={19} />
                  <span className="text-[0.65rem] font-semibold tracking-wide">{label}</span>
                </motion.button>
              ))}
            </div>

            <motion.button
              onClick={() => navigate('/workout/new')}
              className="mt-2 flex h-14 items-center justify-center gap-2 rounded-[var(--radius-lg)] text-sm font-semibold"
              style={{
                background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)',
                color: 'var(--accent-foreground)',
                boxShadow: '0 14px 32px rgba(90,166,255,0.22)',
              }}
              whileTap={{ scale: 0.96 }}
              title="Nowy trening"
            >
              <Plus size={18} />
            </motion.button>

            <div className="mt-auto flex flex-col gap-2">
              <div
                className="rounded-[var(--radius-lg)] px-3 py-2 text-center"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                }}
              >
                <p className="text-[0.6rem] font-semibold uppercase tracking-[0.28em]" style={{ color: 'var(--muted-soft)' }}>
                  IronLog
                </p>
                <p className="mt-1 text-[0.7rem] leading-5" style={{ color: 'var(--muted)' }}>
                  Performance intelligence
                </p>
              </div>

              <motion.button
                onClick={logoutUser}
                className="desktop-rail-button"
                whileTap={{ scale: 0.94 }}
                title="Wyloguj"
                aria-label="Wyloguj"
              >
                <LogOut size={18} />
                <span className="text-[0.65rem] font-semibold tracking-wide">Wyloguj</span>
              </motion.button>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          {children}
        </div>
      </div>

      {bottomNav && <BottomNav />}
    </div>
  )
}
