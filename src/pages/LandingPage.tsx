import { Link } from 'react-router-dom'
import { BrandLink } from '../components/AuthShell'
import LandingCompression from '../components/LandingCompression'
import LandingDemo from '../components/LandingDemo'
import LandingPaste from '../components/LandingPaste'
import { EXAMPLE_DAY } from '../shared/landingDay'

export default function LandingPage() {
  return (
    <div className="landing">
      <div className="landing-paper">
        <header className="landing-bar">
          <BrandLink />
          <nav className="landing-nav" aria-label="Account">
            <Link to="/login" className="landing-signin">Sign in</Link>
          </nav>
        </header>

        <div className="landing-hero">
          <div className="landing-copy">
            <h1>Your plan, cut to the time you have.</h1>
            <p>Say how long you have today. SHEAR puts your exercises into supersets, then drops extras. Your weights and your saved plan stay the same.</p>
            <Link to="/register" className="ui-button landing-ink landing-ink--hero">Create account</Link>
          </div>

          <LandingCompression day={EXAMPLE_DAY} playing label="Example plan" />
        </div>
      </div>

      <main className="landing-dark">
        <div className="landing-phone-cta">
          <Link to="/register" className="ui-button ui-button--primary landing-primary">Create account</Link>
        </div>

        <section className="landing-section" id="your-plan" aria-labelledby="landing-plan-title">
          <div className="landing-section-copy">
            <h2 id="landing-plan-title">Try it on your own plan</h2>
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

      <footer className="landing-paper landing-close" aria-labelledby="landing-close-title">
        <h2 id="landing-close-title">Bring the plan you already train.</h2>
        <Link to="/register" className="ui-button landing-ink">Create account</Link>
        <small>Free on the web. The Android app is in testing.</small>
      </footer>
    </div>
  )
}
