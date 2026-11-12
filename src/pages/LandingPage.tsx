import { Link } from 'react-router-dom'
import { BrandLink } from '../components/AuthShell'
import LandingCompression from '../components/LandingCompression'
import LandingDemo from '../components/LandingDemo'
import LandingPaste from '../components/LandingPaste'
import { EXAMPLE_DAY } from '../shared/landingDay'

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

      <main>
        <div className="landing-hero">
          <div className="landing-copy">
            <h1>Your plan, cut to the time you have.</h1>
            <p>Pick how long you have today. SHEAR pairs exercises into supersets and trims extras at your usual weights, and your plan stays as you wrote it.</p>
            <i className="auth-seam" aria-hidden="true" />
          </div>

          <LandingCompression day={EXAMPLE_DAY} playing label="Example plan" />

          <div className="landing-cta">
            <div className="landing-actions">
              <Link to="/register" className="ui-button ui-button--primary landing-primary">Create account</Link>
              <a href="#your-plan" className="auth-alt">Try it on your own plan</a>
            </div>
            <small>Free on the web. The Android app is in testing.</small>
          </div>
        </div>

        <section className="landing-section" id="your-plan" aria-labelledby="landing-plan-title">
          <div className="landing-section-copy">
            <h2 id="landing-plan-title">Try it on your plan</h2>
            <p>Paste it from Notes, a spreadsheet or another app, in English or Polish. Nothing is saved.</p>
          </div>
          <LandingPaste />
        </section>

        <section className="landing-section" aria-labelledby="landing-log-title">
          <div className="landing-section-copy">
            <h2 id="landing-log-title">Then log it set by set</h2>
            <p>Last time sits next to today, and the next weight comes from how your recent sets went.</p>
          </div>
          <LandingDemo />
        </section>
      </main>
    </div>
  )
}
