import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import BrandMark from './BrandMark'

interface AuthShellProps {
  title: string
  subtitle: string
  children: ReactNode
}

export default function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="auth-shell">
      <div className="auth-cover">
        <img src="/covers/push.jpg" alt="" />
        <Link to="/" className="auth-brand">
          <span className="auth-brand-mark">
            <BrandMark />
          </span>
          SHEAR
        </Link>
        <div className="auth-cover-copy">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <i className="auth-seam" aria-hidden="true" />
      </div>

      <main className="auth-main">
        {children}
      </main>
    </div>
  )
}
