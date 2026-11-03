import { Link } from 'react-router-dom'
import { BrandLink } from '../components/AuthShell'
import LandingDemo from '../components/LandingDemo'

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-bar">
        <BrandLink />
        <nav className="landing-nav" aria-label="Account">
          <Link to="/login" className="landing-signin">Sign in</Link>
          <Link to="/register" className="landing-signin">Create account</Link>
        </nav>
      </header>

      <main className="landing-hero">
        <div className="landing-copy">
          <h1>Train with a plan. Keep every set.</h1>
          <p>A strength training log for plans, live sessions, history and progress. This is the set panel you log with.</p>
          <i className="auth-seam" aria-hidden="true" />
          <div className="landing-actions">
            <Link to="/register" className="ui-button ui-button--primary landing-primary">Create account</Link>
            <Link to="/login" className="auth-alt">Sign in</Link>
          </div>
          <small>Private beta on web and Android.</small>
        </div>

        <LandingDemo />
      </main>
    </div>
  )
}
