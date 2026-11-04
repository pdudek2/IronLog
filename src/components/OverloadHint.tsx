import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { SessionHint } from '../shared/progression'

interface Props {
  hint: SessionHint
  onApply: () => void
  onDismiss: () => void
}

export default function OverloadHint({ hint, onApply, onDismiss }: Props) {
  return (
    <motion.div
      className="overload-hint"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
    >
      <span className="overload-hint-copy">{hint.label}</span>
      {(hint.weight !== undefined || hint.reps !== undefined) && (
        <button
          type="button"
          onClick={onApply}
          className="overload-hint-apply"
        >
          Apply
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss suggestion"
        className="overload-hint-dismiss"
      >
        <X size={14} />
      </button>
    </motion.div>
  )
}
