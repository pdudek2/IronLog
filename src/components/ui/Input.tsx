import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

export default function Input({ error, className = '', style, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      <input
        className={`rounded-[var(--radius-sm)] px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-[color:var(--muted-soft)] ${className}`}
        style={{
          background: 'var(--input-bg)',
          border: `1px solid ${error ? '#FF4B4B' : 'var(--border)'}`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
          ...style,
        }}
        {...props}
      />
      {error && <p className="text-xs" style={{ color: '#FF4B4B' }}>{error}</p>}
    </div>
  )
}
