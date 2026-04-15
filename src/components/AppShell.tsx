import type { ReactNode } from 'react'
import BottomNav from './BottomNav'
import TopNav from './TopNav'

type AppSection = 'dashboard' | 'history' | 'templates' | 'exercises' | 'profile' | 'progress' | 'chat'

interface AppShellProps {
  current?: AppSection
  bottomNav?: boolean
  streak?: number
  children: ReactNode
}

export default function AppShell({
  current,
  bottomNav = true,
  streak,
  children,
}: AppShellProps) {
  return (
    <>
      <TopNav current={current} streak={streak} />
      <div className="page-shell">
        <div className="page-container">
          <div className="min-w-0">{children}</div>
        </div>
      </div>
      {bottomNav && <BottomNav />}
    </>
  )
}
