import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Dumbbell, History, LayoutDashboard, Layers3, Plus, Sparkles, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { navigateWithAppTransition } from '../lib/viewTransitions'
import { hasActiveSessionWork } from '../lib/activeSessionService'
import { preloadRouteByPath } from '../router/pageLoaders'
import { useWorkoutStore } from '../store/workoutStore'
import { useMobileInteraction } from './MobileInteractionProvider'

interface NavBtnProps {
  icon: ReactNode
  label: string
  active: boolean
  onClick: () => void
  preloadTo?: string
}

function NavBtn({ icon, label, active, onClick, preloadTo }: NavBtnProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onPointerEnter={() => { if (preloadTo) void preloadRouteByPath(preloadTo) }}
      onFocus={() => { if (preloadTo) void preloadRouteByPath(preloadTo) }}
      className="bottom-nav-button mobile-touch-target flex flex-1 flex-col items-center gap-0.5 py-0.5"
      data-active={active}
      whileTap={{ scale: 0.88 }}
      style={{ color: active ? 'var(--text-strong)' : 'var(--muted)' }}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
    >
      {icon}
      <span className="text-[9px] font-semibold">{label}</span>
      <span
        className="h-1 w-5 rounded-full transition-opacity"
        style={{ background: 'var(--accent-text)', opacity: active ? 1 : 0 }}
        aria-hidden="true"
      />
    </motion.button>
  )
}

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const [hidden, setHidden] = useState(false)
  const { inputFocused } = useMobileInteraction()
  const active = useWorkoutStore((state) => state.active)
  const navRef = useRef<HTMLElement>(null)
  const movingFocusFromNavRef = useRef(false)
  const lastScrollYRef = useRef(0)
  const hiddenRef = useRef(false)

  const path = location.pathname
  const workoutActive = path.startsWith('/workout/new')
  const hasActiveWork = hasActiveSessionWork(active)
  const go = (to: string) => navigateWithAppTransition(navigate, to)

  useEffect(() => {
    hiddenRef.current = hidden
  }, [hidden])

  useEffect(() => {
    let rafId = 0
    let pending = false

    const evaluate = () => {
      pending = false
      const currentY = window.scrollY
      const delta = currentY - lastScrollYRef.current

      if (currentY < 24) {
        if (hiddenRef.current) setHidden(false)
      } else if (delta > 10 && !hiddenRef.current) {
        setHidden(true)
      } else if (delta < -10 && hiddenRef.current) {
        setHidden(false)
      }

      lastScrollYRef.current = currentY
    }

    const onScroll = () => {
      if (pending) return
      pending = true
      rafId = window.requestAnimationFrame(evaluate)
    }

    lastScrollYRef.current = window.scrollY
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.cancelAnimationFrame(rafId)
    }
  }, [])

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.matches('main.page-shell')) {
        lastScrollYRef.current = window.scrollY
        if (!movingFocusFromNavRef.current) setHidden(false)
      }
    }

    window.addEventListener('focusin', onFocusIn)
    return () => {
      window.removeEventListener('focusin', onFocusIn)
    }
  }, [])

  const navHidden = hidden || inputFocused

  useEffect(() => {
    if (!navHidden) return

    const activeElement = document.activeElement
    if (!(activeElement instanceof HTMLElement) || !navRef.current?.contains(activeElement)) return

    const main = document.querySelector<HTMLElement>('main.page-shell')
    if (!main) return

    movingFocusFromNavRef.current = true
    main.focus({ preventScroll: true })
    movingFocusFromNavRef.current = false
  }, [navHidden])

  return (
    <nav
      ref={navRef}
      aria-label="Nawigacja dolna"
      aria-hidden={navHidden ? true : undefined}
      inert={navHidden}
      className="bottom-nav fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 lg:hidden"
      style={{
        paddingBottom: 'max(0.85rem, env(safe-area-inset-bottom, 0px))',
        transform: navHidden ? 'translateY(calc(100% + env(safe-area-inset-bottom, 0px) + 1rem))' : 'translateY(0)',
        opacity: navHidden ? 0 : 1,
        pointerEvents: navHidden ? 'none' : 'auto',
        transition: 'transform 220ms ease, opacity 180ms ease',
      }}
    >
      <div className="bottom-nav-panel flex w-full max-w-sm items-center gap-1 rounded-[var(--radius-xl)] px-3 py-2.5">
        <NavBtn
          icon={<LayoutDashboard size={20} />}
          label="Start"
          active={path === '/dashboard'}
          preloadTo="/dashboard"
          onClick={() => go('/dashboard')}
        />

        <NavBtn
          icon={<TrendingUp size={20} />}
          label="Postępy"
          active={path.startsWith('/progress')}
          preloadTo="/progress"
          onClick={() => go('/progress')}
        />

        <NavBtn
          icon={<Layers3 size={20} />}
          label="Plany"
          active={path.startsWith('/templates')}
          preloadTo="/templates"
          onClick={() => go('/templates')}
        />

        <NavBtn
          icon={<Dumbbell size={20} />}
          label="Ćwiczenia"
          active={path.startsWith('/exercises')}
          preloadTo="/exercises"
          onClick={() => go('/exercises')}
        />

        <motion.button
          type="button"
          onClick={() => go('/workout/new')}
          onPointerEnter={() => { void preloadRouteByPath('/workout/new') }}
          onFocus={() => { void preloadRouteByPath('/workout/new') }}
          className="bottom-nav-primary-action mobile-touch-target flex h-11 w-11 flex-none items-center justify-center rounded-[var(--radius-lg)]"
          style={{
            background: 'var(--primary-gradient)',
            color: 'var(--accent-foreground)',
            boxShadow: '0 12px 28px rgba(240,67,90,0.22)',
          }}
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.06 }}
          aria-current={workoutActive ? 'page' : undefined}
          aria-label={hasActiveWork ? 'Wznów trening' : 'Rozpocznij nowy trening'}
        >
          <Plus size={22} strokeWidth={2.5} />
        </motion.button>

        <NavBtn
          icon={<History size={20} />}
          label="Historia"
          active={path.startsWith('/history')}
          preloadTo="/history"
          onClick={() => go('/history')}
        />

        <NavBtn
          icon={<Sparkles size={20} />}
          label="AI"
          active={path.startsWith('/chat')}
          preloadTo="/chat"
          onClick={() => go('/chat')}
        />
      </div>
    </nav>
  )
}
