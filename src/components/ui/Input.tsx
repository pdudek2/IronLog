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
        className={`ui-input px-4 py-3 text-sm outline-none ${className}`}
        style={{
          ...style,
        }}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="ui-field-error">
          {error}
        </p>
      )}
    </div>
  )
}
