import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Dumbbell, History, MessageSquare, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { navigateWithAppTransition } from '../lib/viewTransitions'
import { preloadRouteByPath } from '../router/pageLoaders'
import { useWorkoutStore } from '../store/workoutStore'
import ActiveWorkoutReturnBar from './ActiveWorkoutReturnBar'
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
      className="bottom-nav-button mobile-touch-target flex flex-1 flex-col items-center justify-center gap-0.5"
      data-active={active}
      whileTap={{ scale: 0.88 }}
      style={{ color: active ? 'var(--text-strong)' : 'var(--muted)' }}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </motion.button>
  )
}

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { inputFocused } = useMobileInteraction()
  const hasActiveSession = useWorkoutStore((state) => state.active !== null)
  const navRef = useRef<HTMLElement>(null)

  const path = location.pathname
  const workoutActive = path.startsWith('/workout/new')
  const workoutDetail = path.startsWith('/workout/') && !workoutActive
  const go = (to: string) => navigateWithAppTransition(navigate, to)

  // With no session /workout/new is a resting page, so the bar stays as the way out.
  const navHidden = (workoutActive && hasActiveSession) || workoutDetail || inputFocused

  useEffect(() => {
    if (!navHidden) return

    const activeElement = document.activeElement
    if (!(activeElement instanceof HTMLElement) || !navRef.current?.contains(activeElement)) return
    document.querySelector<HTMLElement>('main.page-shell')?.focus({ preventScroll: true })
  }, [navHidden])

  return (
    <nav
      ref={navRef}
      aria-label="Bottom navigation"
      aria-hidden={navHidden ? true : undefined}
      inert={navHidden}
      className="bottom-nav fixed bottom-0 left-0 right-0 z-50 flex flex-col lg:hidden"
    >
      {!workoutDetail && <ActiveWorkoutReturnBar />}
      <div className="bottom-nav-panel flex w-full items-stretch">
        <NavBtn
          icon={<Dumbbell size={20} />}
          label="Train"
          active={path === '/dashboard' || path.startsWith('/templates') || path.startsWith('/exercises')}
          preloadTo="/dashboard"
          onClick={() => go('/dashboard')}
        />

        <NavBtn
          icon={<History size={20} />}
          label="History"
          active={path.startsWith('/history')}
          preloadTo="/history"
          onClick={() => go('/history')}
        />

        <NavBtn
          icon={<TrendingUp size={20} />}
          label="Progress"
          active={path.startsWith('/progress')}
          preloadTo="/progress"
          onClick={() => go('/progress')}
        />

        <NavBtn
          icon={<MessageSquare size={20} />}
          label="Coach"
          active={path.startsWith('/chat')}
          preloadTo="/chat"
          onClick={() => go('/chat')}
        />
      </div>
    </nav>
  )
}
