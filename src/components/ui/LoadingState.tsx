import { motion } from 'framer-motion'

interface LoadingStateProps {
  message?: string
  fullScreen?: boolean
}

function LoadingPanel({ message }: { message: string }) {
  return (
    <div className="surface-panel w-full max-w-sm rounded-[var(--radius-xl)] px-6 py-8 text-center">
      <motion.div
        className="mx-auto mb-4 h-11 w-11 rounded-[var(--radius-md)]"
        style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-strong)' }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, ease: 'linear', duration: 1.4 }}
      />
      <p className="text-sm font-medium text-white">{message}</p>
      <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
        To potrwa tylko chwilę.
      </p>
    </div>
  )
}

export default function LoadingState({
  message = 'Ładowanie...',
  fullScreen = true,
}: LoadingStateProps) {
  if (!fullScreen) return <LoadingPanel message={message} />

  return (
    <div className="page-shell flex items-center justify-center">
      <div className="page-container flex justify-center">
        <LoadingPanel message={message} />
      </div>
    </div>
  )
}
