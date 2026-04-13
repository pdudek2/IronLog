import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Dumbbell, LayoutDashboard, Plus, Sparkles, TrendingUp, User } from 'lucide-react'
import type { ReactNode } from 'react'

interface NavBtnProps {
  icon: ReactNode
  label: string
  active: boolean
  onClick: () => void
}

function NavBtn({ icon, label, active, onClick }: NavBtnProps) {
  return (
    <motion.button
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-1 py-1"
      whileTap={{ scale: 0.88 }}
      style={{ color: active ? 'var(--accent)' : 'var(--muted)' }}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
    >
      {icon}
      <span className="text-[10px] font-semibold tracking-wide">{label}</span>
      <span
        className="h-1 w-6 rounded-full transition-opacity"
        style={{ background: 'var(--accent)', opacity: active ? 1 : 0 }}
        aria-hidden="true"
      />
    </motion.button>
  )
}

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  const path = location.pathname

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 lg:hidden"
      style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
    >
      <div
        className="flex w-full max-w-sm items-center gap-1 rounded-[var(--radius-xl)] px-4 py-3"
        style={{
          background: 'linear-gradient(180deg, rgba(21,28,43,0.96) 0%, rgba(15,20,32,0.98) 100%)',
          border: '1px solid var(--border)',
          boxShadow: '0 -8px 40px rgba(2,8,20,0.56), inset 0 1px 0 rgba(255,255,255,0.03)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        <NavBtn
          icon={<LayoutDashboard size={20} />}
          label="Start"
          active={path === '/dashboard'}
          onClick={() => navigate('/dashboard')}
        />

        <NavBtn
          icon={<TrendingUp size={20} />}
          label="Postępy"
          active={path.startsWith('/progress')}
          onClick={() => navigate('/progress')}
        />

        <NavBtn
          icon={<Dumbbell size={20} />}
          label="Ćwiczenia"
          active={path.startsWith('/exercises')}
          onClick={() => navigate('/exercises')}
        />

        <motion.button
          onClick={() => navigate('/workout/new')}
          className="mx-2 flex h-12 w-12 flex-none items-center justify-center rounded-[var(--radius-lg)]"
          style={{
            background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)',
            color: 'var(--accent-foreground)',
            boxShadow: '0 12px 28px rgba(90,166,255,0.22)',
          }}
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.06 }}
        >
          <Plus size={22} strokeWidth={2.5} />
        </motion.button>

        <NavBtn
          icon={<Sparkles size={20} />}
          label="AI"
          active={path.startsWith('/chat')}
          onClick={() => navigate('/chat')}
        />

        <NavBtn
          icon={<User size={20} />}
          label="Profil"
          active={path === '/profile'}
          onClick={() => navigate('/profile')}
        />
      </div>
    </nav>
  )
}
