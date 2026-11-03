import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import BrandMark from './BrandMark'

interface AuthShellProps {
  title: string
  subtitle: string
  children: ReactNode
}

export function BrandLink() {
  return (
    <Link to="/" className="auth-brand">
      <span className="auth-brand-mark">
        <BrandMark />
      </span>
      SHEAR
    </Link>
  )
}

export default function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="auth-shell">
      <header className="landing-bar">
        <BrandLink />
      </header>

      <main className="auth-main">
        <div className="auth-head">
          <h1>{title}</h1>
          <p>{subtitle}</p>
          <i className="auth-seam" aria-hidden="true" />
        </div>
        <div className="auth-panel">
          {children}
        </div>
      </main>
    </div>
  )
}
