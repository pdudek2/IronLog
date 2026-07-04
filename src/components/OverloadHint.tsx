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

  const accent =
    delta > 0 ? 'var(--accent)' :
    delta < 0 ? '#FF5757' :
    'var(--muted)'

  const Icon =
    delta > 0 ? TrendingUp :
    delta < 0 ? TrendingDown :
    Minus

  const deltaLabel =
    delta > 0 ? `+${delta} kg` :
    delta < 0 ? `${delta} kg` :
    '±0'

  return (
    <motion.div
      className="mb-4 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] px-3.5 py-2.5"
      style={{
        background: `${delta > 0 ? 'var(--accent-soft)' : delta < 0 ? 'rgba(255,87,87,0.06)' : 'rgba(255,255,255,0.04)'}`,
        border: `1px solid ${delta > 0 ? 'var(--accent-soft-strong)' : delta < 0 ? 'rgba(255,87,87,0.2)' : 'var(--border)'}`,
      }}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon size={14} style={{ color: accent, flexShrink: 0 }} />
        <div className="min-w-0">
          <p className="text-[11px] font-medium truncate" style={{ color: accent }}>
            {REASON_LABEL[reason]} • {deltaLabel}
          </p>
          <p className="text-xs font-semibold text-white tabular-nums">
            Sugestia: {suggestedWeight} kg
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-none">
        <button
          onClick={() => onApply(suggestedWeight)}
          className="rounded-[var(--radius-md)] px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: accent, color: delta > 0 ? 'var(--accent-foreground)' : delta < 0 ? '#fff' : 'var(--bg)' }}
        >
          Zastosuj
        </button>
        <button
          onClick={onDismiss}
          aria-label="Odrzuć sugestię"
          className="transition-opacity hover:opacity-70"
          style={{ color: 'var(--muted)' }}
        >
          <X size={14} />
        </button>
      </div>
    </motion.div>
  )
}
