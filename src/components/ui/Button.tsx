import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
}

const styles: Record<Variant, { className: string; style: React.CSSProperties }> = {
  primary: {
    className: 'py-3 rounded-lg font-semibold text-sm tracking-wide transition-opacity disabled:opacity-50 hover:opacity-90',
    style: { background: 'var(--accent)', color: '#08061A' },
  },
  ghost: {
    className: 'surface-panel rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-70',
    style: { color: 'var(--muted)' },
  },
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
  const v = styles[variant]
  return (
    <button
      disabled={disabled || loading}
      className={`${v.className} ${className}`}
      style={{ ...v.style, ...style }}
      {...props}
    >
      {loading ? 'Ładowanie...' : children}
    </button>
  )
}
