import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

export default function Input({ error, className = '', style, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      <input
        className={`px-4 py-3 rounded-lg text-sm text-white outline-none transition-all ${className}`}
        style={{
          background: 'var(--input-bg)',
          border: `1px solid ${error ? '#FF4B4B' : 'var(--border)'}`,
          ...style,
        }}
        {...props}
      />
      {error && <p className="text-xs" style={{ color: '#FF4B4B' }}>{error}</p>}
    </div>
  )
}
