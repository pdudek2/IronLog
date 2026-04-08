import { motion, AnimatePresence } from 'framer-motion'

interface ConfirmDialogProps {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  message,
  confirmLabel = 'Tak',
  cancelLabel = 'Anuluj',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center px-4"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0"
          style={{ background: 'rgba(8,6,26,0.7)', backdropFilter: 'blur(6px)' }}
        />

        {/* Panel */}
        <motion.div
          className="relative z-10 w-full max-w-sm rounded-[2rem] p-6"
          style={{
            background: 'linear-gradient(180deg, rgba(34,31,67,0.98) 0%, rgba(18,17,37,0.99) 100%)',
            border: '1px solid rgba(128,140,179,0.18)',
            boxShadow: '0 32px 80px rgba(4,6,18,0.6)',
          }}
          initial={{ y: 40, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-6 text-sm leading-relaxed text-white">{message}</p>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-70"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
              }}
            >
              {cancelLabel}
            </button>
            <motion.button
              onClick={onConfirm}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
              style={{
                background: danger ? '#FF4B4B' : 'var(--accent)',
                color: danger ? '#fff' : '#08061A',
              }}
              whileTap={{ scale: 0.95 }}
            >
              {confirmLabel}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
