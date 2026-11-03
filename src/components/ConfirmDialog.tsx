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
  title = 'Confirm action',
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'Cancel',
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
        <div className="absolute inset-0" style={{ background: 'rgba(13, 11, 10, 0.6)' }} />

        <motion.div
          ref={dialogRef}
          className="confirm-dialog"
          data-danger={danger || undefined}
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
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{message}</p>
          <div className="confirm-dialog-actions">
            <button ref={cancelButtonRef} type="button" className="dialog-action" data-quiet onClick={onCancel}>
              {cancelLabel}
            </button>
            <motion.button
              type="button"
              className="dialog-action"
              onClick={onConfirm}
              disabled={confirmDisabled}
              whileTap={confirmDisabled ? undefined : { scale: 0.97 }}
            >
              {confirmLabel}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
