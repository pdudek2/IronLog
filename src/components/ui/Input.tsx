import { useId, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

export default function Input({
  error,
  className = '',
  style,
  id,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ...props
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = error ? `${inputId}-error` : undefined
  const describedBy = [ariaDescribedBy, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1">
      <input
        id={inputId}
        aria-invalid={ariaInvalid ?? (error ? true : undefined)}
        aria-describedby={describedBy}
        className={`rounded-[var(--radius-sm)] px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-[color:var(--muted-soft)] ${className}`}
        style={{
          background: 'var(--input-bg)',
          border: `1px solid ${error ? '#FF4B4B' : 'var(--border)'}`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
          ...style,
        }}
        {...props}
      />
      {error && <p id={errorId} className="text-xs" style={{ color: '#FF4B4B' }}>{error}</p>}
    </div>
  )
}
