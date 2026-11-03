import { useState, type InputHTMLAttributes } from 'react'

function sanitizeDecimal(raw: string): string {
  return raw.replace(/,/g, '.').replace(/[^\d.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1')
}

interface WeightInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> {
  value: string
  onValueChange: (value: string) => void
}

// A number input would show the browser locale's separator and hide what was typed, so "93,75" sat next to "93.75".
export default function WeightInput({ value, onValueChange, onBlur, ...props }: WeightInputProps) {
  const [draft, setDraft] = useState<string | null>(null)
  // A half-typed "90." stays on screen while it still means the stored value; steppers replace it.
  // Some callers show 0 as an empty field, so "0." must still count as the stored value.
  const showDraft = draft !== null && (Number.parseFloat(draft) || 0) === (Number.parseFloat(value) || 0)

  return (
    <input
      {...props}
      type="text"
      role="spinbutton"
      inputMode="decimal"
      value={showDraft ? draft : value}
      onChange={(event) => {
        const next = sanitizeDecimal(event.target.value)
        setDraft(next)
        onValueChange(next)
      }}
      onBlur={(event) => {
        setDraft(null)
        onBlur?.(event)
      }}
    />
  )
}
