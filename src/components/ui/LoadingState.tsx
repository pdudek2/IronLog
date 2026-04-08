import { motion } from 'framer-motion'

interface LoadingStateProps {
  message?: string
  fullScreen?: boolean
}

function LoadingPanel({ message }: { message: string }) {
  return (
    <div className="surface-panel w-full max-w-sm rounded-[2rem] px-6 py-8 text-center">
      <motion.div
        className="mx-auto mb-4 h-11 w-11 rounded-2xl"
        style={{ background: 'rgba(232,255,87,0.14)', border: '1px solid rgba(232,255,87,0.24)' }}
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
