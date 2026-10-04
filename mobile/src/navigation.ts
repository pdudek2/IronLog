import type { ActiveSessionState } from './activeSessionController'
import type { LaunchState } from './workoutLaunchController'

export function navigationSection(path: string): 'Home' | 'Plans' | 'Workout' | 'Progress' | 'Coach' | undefined {
  if (path === '/') return 'Workout'
  if (path === '/dashboard') return 'Home'
  if (path.startsWith('/templates') || path === '/exercises' || path.startsWith('/exercises/')) return 'Plans'
  if (path === '/progress' || path === '/history' || path.startsWith('/workout/') || path.startsWith('/workout-edit/')) return 'Progress'
  if (path === '/coach') return 'Coach'
}

export function workoutNavigationAction(active: ActiveSessionState['status'], closure: string, launch: LaunchState['status']): 'start' | 'resume' | 'recover' | 'wait' {
  if (closure !== 'ready') return 'recover'
  if (active === 'ready') return 'resume'
  if (active !== 'empty') return 'wait'
  if (launch === 'ready' || launch === 'unavailable') return 'start'
  return launch === 'loading' || launch === 'starting' ? 'wait' : 'recover'
}

export function scrollNavigation(previous: { y: number; start: number; direction: number; hidden: boolean }, rawY: number) {
  const y = Math.max(0, rawY)
  if (y < 24) return { y, start: y, direction: 0, hidden: false }
  const direction = Math.sign(y - previous.y)
  if (!direction) return previous
  const start = direction === previous.direction ? previous.start : previous.y
  const crossed = Math.abs(y - start) >= 24
  return { y, start: crossed ? y : start, direction, hidden: crossed ? direction > 0 : previous.hidden }
}
