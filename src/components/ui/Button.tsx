import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
}

const styles: Record<Variant, { className: string; style: React.CSSProperties }> = {
  primary: {
    className: 'rounded-[var(--radius-md)] px-4 py-3 text-sm font-semibold transition-all disabled:opacity-50 hover:opacity-90',
    style: {
      background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)',
      color: 'var(--accent-foreground)',
      boxShadow: '0 14px 32px rgba(90,166,255,0.22)',
    },
  },
  ghost: {
    className: 'rounded-[var(--radius-md)] px-4 py-2.5 text-xs font-semibold transition-all hover:opacity-90',
    style: {
      color: 'var(--muted)',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid var(--border)',
    },
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
