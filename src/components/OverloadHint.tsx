import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { overloadHintLabel, type OverloadSuggestion } from '../lib/overloadService'
import type { Units } from '../lib/userProfile'

interface Props {
  suggestion: OverloadSuggestion
  units: Units
  onApply: (weight: number) => void
  onDismiss: () => void
}

export default function OverloadHint({ suggestion, units, onApply, onDismiss }: Props) {
  return (
    <motion.div
      className="overload-hint"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
    >
      <span className="overload-hint-copy">{overloadHintLabel(suggestion, units)}</span>
      <button
        type="button"
        onClick={() => onApply(suggestion.suggestedWeight)}
        className="overload-hint-apply"
      >
        Apply
      </button>
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
