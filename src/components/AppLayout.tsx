import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import BottomNav from './BottomNav'
import TopNav from './TopNav'

export type AppSection =
  | 'dashboard'
  | 'history'
  | 'templates'
  | 'exercises'
  | 'profile'
  | 'progress'
  | 'chat'

/**
 * Derives the active nav section from the current pathname. Keeps the layout
 * self-sufficient so we don't need a data router for `useMatches`.
 */
function sectionFromPath(path: string): AppSection | undefined {
  if (path.startsWith('/dashboard')) return 'dashboard'
  if (path.startsWith('/history')) return 'history'
  if (path.startsWith('/progress')) return 'progress'
  if (path.startsWith('/templates')) return 'templates'
  if (path.startsWith('/exercises')) return 'exercises'
  if (path.startsWith('/chat')) return 'chat'
  if (path.startsWith('/profile')) return 'profile'
  return undefined
}

/** Routes where BottomNav should be hidden (distraction-free focus mode). */
function shouldHideBottomNav(path: string): boolean {
  return path.startsWith('/workout/new')
}

function PageFallback() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center">
      <motion.div
        aria-hidden="true"
        className="h-10 w-10 rounded-[var(--radius-md)]"
        style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-strong)' }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, ease: 'linear', duration: 1.4 }}
      />
    </div>
  )
}

export default function AppLayout() {
  const location = useLocation()
  const section = sectionFromPath(location.pathname)
  const bottomNav = !shouldHideBottomNav(location.pathname)

  return (
    <>
      <TopNav current={section} />
      <div className="page-shell">
        <div className="page-container">
          <div className="min-w-0">
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </div>
      </div>
      {bottomNav && <BottomNav />}
    </>
  )
}
