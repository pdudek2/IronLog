import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
}

const variantClass: Record<Variant, string> = {
  primary: 'ui-button--primary px-4 py-3',
  ghost: 'ui-button--ghost px-4 py-2.5',
}

export default function Button({
  variant = 'primary',
  loading = false,
  children,
  disabled,
  className = '',
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      className={`ui-button ${variantClass[variant]} ${className}`}
      style={style}
      {...props}
    >
      {loading ? 'Ładowanie...' : children}
    </button>
  )
}
