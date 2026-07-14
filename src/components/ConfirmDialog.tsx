import { useId, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDialogA11y } from '../hooks/useDialogA11y'

interface ConfirmDialogProps {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title = 'Potwierdź akcję',
  message,
  confirmLabel = 'Tak',
  cancelLabel = 'Anuluj',
  danger = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useDialogA11y({
    containerRef: dialogRef,
    onClose: onCancel,
    initialFocusRef: cancelButtonRef,
  })

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
          style={{ background: 'rgba(8, 7, 9, 0.76)', backdropFilter: 'blur(8px)' }}
        />

        {/* Panel */}
        <motion.div
          ref={dialogRef}
          className="surface-panel relative z-10 w-full max-w-sm rounded-[var(--radius-xl)] p-6"
          style={{
            border: '1px solid var(--border-strong)',
            boxShadow: 'var(--shadow-panel)',
          }}
          initial={{ y: 40, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
        >
          <p id={titleId} className="mb-2 text-base font-semibold" style={{ color: 'var(--text-strong)' }}>
            {title}
          </p>
          <p
            id={descriptionId}
            className="mb-6 text-sm leading-relaxed"
            style={{ color: 'var(--muted)' }}
          >
            {message}
          </p>

          <div className="flex gap-3">
            <button
              ref={cancelButtonRef}
              onClick={onCancel}
              className="flex-1 rounded-[var(--radius-md)] py-2.5 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{
                background: 'var(--surface-muted)',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
              }}
            >
              {cancelLabel}
            </button>
            <motion.button
              type="button"
              onClick={onConfirm}
              disabled={confirmDisabled}
              className="flex-1 rounded-[var(--radius-md)] py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55"
              style={{
                background: danger ? 'var(--danger)' : 'var(--primary-gradient)',
                color: danger ? '#fff' : 'var(--accent-foreground)',
              }}
              whileTap={confirmDisabled ? undefined : { scale: 0.95 }}
            >
              {confirmLabel}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
