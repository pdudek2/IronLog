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

const SCROLL_DIRECTION_THRESHOLD = 24

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
    </motion.button>
  )
}

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { inputFocused } = useMobileInteraction()
  const active = useWorkoutStore((state) => state.active)
  const [scrollHidden, setScrollHidden] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  const path = location.pathname
  const workoutActive = path.startsWith('/workout/new')
  const workoutDetail = path.startsWith('/workout/') && !workoutActive
  const hasActiveWork = hasActiveSessionWork(active)
  const go = (to: string) => navigateWithAppTransition(navigate, to)

  useEffect(() => {
    if (inputFocused || workoutDetail) return

    let frameId = 0
    let pending = false
    let lastScrollY = Math.max(0, window.scrollY)
    let directionStartY = lastScrollY
    let direction = 0

    const evaluate = () => {
      pending = false
      const currentScrollY = Math.max(0, window.scrollY)

      if (currentScrollY < SCROLL_DIRECTION_THRESHOLD) {
        setScrollHidden(false)
        lastScrollY = currentScrollY
        directionStartY = currentScrollY
        direction = 0
        return
      }

      const nextDirection = Math.sign(currentScrollY - lastScrollY)
      if (nextDirection === 0) return

      if (nextDirection !== direction) {
        direction = nextDirection
        directionStartY = lastScrollY
      }

      if (Math.abs(currentScrollY - directionStartY) >= SCROLL_DIRECTION_THRESHOLD) {
        setScrollHidden(direction > 0)
        directionStartY = currentScrollY
      }

      lastScrollY = currentScrollY
    }

    const onScroll = () => {
      if (pending) return
      pending = true
      frameId = window.requestAnimationFrame(evaluate)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.cancelAnimationFrame(frameId)
    }
  }, [inputFocused, workoutDetail])

  const navHidden = workoutDetail || inputFocused || scrollHidden

  useEffect(() => {
    if (!navHidden) return

    const activeElement = document.activeElement
    if (!(activeElement instanceof HTMLElement) || !navRef.current?.contains(activeElement)) return
    document.querySelector<HTMLElement>('main.page-shell')?.focus({ preventScroll: true })
  }, [navHidden])

  return (
    <nav
      ref={navRef}
      aria-label="Nawigacja dolna"
      aria-hidden={navHidden ? true : undefined}
      inert={navHidden}
      className="bottom-nav fixed bottom-0 left-0 right-0 z-50 flex justify-center lg:hidden"
      style={{
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))',
        transform: navHidden ? 'translateY(calc(100% + env(safe-area-inset-bottom, 0px) + 1rem))' : 'translateY(0)',
        opacity: navHidden ? 0 : 1,
        pointerEvents: navHidden ? 'none' : 'auto',
        transition: 'transform 220ms ease, opacity 180ms ease',
      }}
    >
      <div className="bottom-nav-panel flex w-full items-center gap-1">
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
