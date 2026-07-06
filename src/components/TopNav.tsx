import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Dumbbell, Flame, History, LayoutDashboard, Layers3, LogOut, Plus, Sparkles, TrendingUp, User } from 'lucide-react'
import { logoutUser } from '../lib/auth'
import { navigateWithAppTransition } from '../lib/viewTransitions'
import { preloadPrimaryRoutes, preloadRouteByPath } from '../router/pageLoaders'
import { useDashboardStore } from '../store/dashboardStore'

type AppSection = 'dashboard' | 'history' | 'templates' | 'exercises' | 'profile' | 'progress' | 'chat'

interface TopNavProps {
  current?: AppSection
  streak?: number
}

const NAV_ITEMS: Array<{
  key: AppSection
  label: string
  icon: typeof LayoutDashboard
  to: string
  match?: (path: string) => boolean
}> = [
  { key: 'dashboard', label: 'Start', icon: LayoutDashboard, to: '/dashboard' },
  { key: 'history', label: 'Historia', icon: History, to: '/history', match: (p) => p.startsWith('/history') },
  { key: 'progress', label: 'Postępy', icon: TrendingUp, to: '/progress', match: (p) => p.startsWith('/progress') },
  { key: 'templates', label: 'Plany', icon: Layers3, to: '/templates', match: (p) => p.startsWith('/templates') },
  { key: 'exercises', label: 'Ćwiczenia', icon: Dumbbell, to: '/exercises', match: (p) => p.startsWith('/exercises') },
  { key: 'chat', label: 'AI Coach', icon: Sparkles, to: '/chat', match: (p) => p.startsWith('/chat') },
]

export default function TopNav({ current, streak: streakProp }: TopNavProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const path = location.pathname
  const storeStreak = useDashboardStore((s) => s.streak)
  const streak = typeof streakProp === 'number' ? streakProp : storeStreak

  const isActive = (item: (typeof NAV_ITEMS)[number]) =>
    current ? current === item.key : item.match ? item.match(path) : path === item.to

  useEffect(() => {
    const preloadTimeoutId = window.setTimeout(() => {
      void preloadPrimaryRoutes()
    }, 120)

    return () => window.clearTimeout(preloadTimeoutId)
  }, [])

  const go = (to: string) => navigateWithAppTransition(navigate, to)

  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <button
          type="button"
          className="top-nav-brand"
          onClick={() => go('/dashboard')}
          aria-label="IronLog — strona główna"
        >
          <span className="top-nav-brand-mark" aria-hidden="true">
            IL
          </span>
          <span className="hidden sm:inline">IronLog</span>
        </button>

        <nav className="top-nav-links" aria-label="Nawigacja główna">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isActive(item)
            return (
              <button
                key={item.key}
                type="button"
                className="top-nav-link"
                data-active={active}
                onClick={() => go(item.to)}
                onPointerEnter={() => { void preloadRouteByPath(item.to) }}
                onFocus={() => { void preloadRouteByPath(item.to) }}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={15} strokeWidth={2} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="top-nav-actions">
          {typeof streak === 'number' && streak > 0 && (
            <motion.button
              type="button"
              className="streak-pill"
              onClick={() => go('/progress')}
              onPointerEnter={() => { void preloadRouteByPath('/progress') }}
              onFocus={() => { void preloadRouteByPath('/progress') }}
              whileTap={{ scale: 0.96 }}
              title={`Seria ${streak} ${streak === 1 ? 'dzień' : 'dni'} — zobacz postępy`}
              aria-label={`Seria treningowa ${streak} dni`}
            >
              <Flame size={13} strokeWidth={2.4} />
              <span>{streak}</span>
            </motion.button>
          )}

          <motion.button
            type="button"
            className="top-nav-cta"
            onClick={() => go('/workout/new')}
            onPointerEnter={() => { void preloadRouteByPath('/workout/new') }}
            onFocus={() => { void preloadRouteByPath('/workout/new') }}
            whileTap={{ scale: 0.97 }}
            aria-label="Rozpocznij nowy trening"
          >
            <Plus size={15} strokeWidth={2.4} />
            <span>Nowy trening</span>
          </motion.button>

          <button
            type="button"
            className="top-nav-icon-btn inline-flex"
            onClick={() => go('/profile')}
            onPointerEnter={() => { void preloadRouteByPath('/profile') }}
            onFocus={() => { void preloadRouteByPath('/profile') }}
            data-active={current === 'profile'}
            aria-label="Profil"
            style={current === 'profile' ? { color: 'var(--text-strong)', background: 'var(--selected-bg)' } : undefined}
          >
            <User size={16} />
          </button>

          <button
            type="button"
            className="top-nav-icon-btn inline-flex"
            onClick={logoutUser}
            aria-label="Wyloguj"
            title="Wyloguj"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </header>
  )
}
