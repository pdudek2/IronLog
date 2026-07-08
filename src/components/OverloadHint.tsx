import { motion } from 'framer-motion'
import { TrendingDown, TrendingUp, Minus, X } from 'lucide-react'
import type { OverloadSuggestion } from '../lib/overloadService'

interface Props {
  suggestion: OverloadSuggestion
  onApply: (weight: number) => void
  onDismiss: () => void
}

const REASON_LABEL: Record<string, string> = {
  progressive: 'Progresja',
  deload_gap:  'Deload — długa przerwa',
  maintain:    'Utrzymaj ciężar',
}

export default function OverloadHint({ suggestion, onApply, onDismiss }: Props) {
  const { suggestedWeight, delta, reason } = suggestion

  const Icon =
    delta > 0 ? TrendingUp :
    delta < 0 ? TrendingDown :
    Minus

  const trend =
    delta > 0 ? 'up' :
    delta < 0 ? 'down' :
    'flat'

  const deltaLabel =
    delta > 0 ? `+${delta} kg` :
    delta < 0 ? `${delta} kg` :
    '±0'

  return (
    <motion.div
      className="overload-hint"
      data-trend={trend}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
    >
      <div className="overload-hint-main">
        <span className="overload-hint-icon" aria-hidden="true">
          <Icon size={14} />
        </span>
        <div className="overload-hint-copy">
          <span>
            {REASON_LABEL[reason]} <small>{deltaLabel}</small>
          </span>
          <strong className="tabular-nums">{suggestedWeight} kg</strong>
        </div>
      </div>

      <div className="overload-hint-actions">
        <button
          onClick={() => onApply(suggestedWeight)}
          className="overload-hint-apply"
        >
          Ustaw
        </button>
        <button
          onClick={onDismiss}
          aria-label="Odrzuć sugestię"
          className="overload-hint-dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </motion.div>
  )
}
