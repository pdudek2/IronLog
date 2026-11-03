import { Link } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import BrandMark from '../components/BrandMark'

const STEPS = [
  {
    cover: 'plan',
    title: 'Plan the week once',
    copy: 'Build a split with days, sets and reps. Train opens on today’s day with the weights you start from.',
  },
  {
    cover: 'legs',
    title: 'Log set by set',
    copy: 'One exercise at a time, the set panel under your thumb and rest timed between sets.',
  },
  {
    cover: 'pull',
    title: 'Watch it add up',
    copy: 'History with a calendar, records as they land and a chart for every lift. Coach reads the same numbers.',
  },
]

export default function LandingPage() {
  const reduceMotion = useReducedMotion()

  return (
    <div className="landing">
      <header className="landing-bar">
        <span className="auth-brand">
          <span className="auth-brand-mark">
            <BrandMark />
          </span>
          SHEAR
        </span>
        <Link to="/login" className="landing-signin">Sign in</Link>
      </header>

      <section className="landing-hero">
        <div className="landing-cover">
          {reduceMotion
            ? <img src="/covers/push.jpg" alt="" />
            : <video src="/covers/push.mp4" poster="/covers/push-start.jpg" autoPlay muted playsInline aria-hidden="true" />}
          <div className="landing-cover-copy">
            <h1>Train with a plan. Keep every set.</h1>
            <p>A strength training log for plans, live sessions, history and progress.</p>
          </div>
          <i className="auth-seam" aria-hidden="true" />
        </div>

        <div className="landing-actions">
          <Link to="/register" className="ui-button ui-button--primary landing-primary">Create account</Link>
          <Link to="/login" className="auth-alt">Sign in</Link>
          <p>Private beta on web and Android.</p>
        </div>
      </section>

      <section className="landing-steps" aria-label="How SHEAR works">
        {STEPS.map((step) => (
          <article key={step.cover} className="landing-step">
            <img src={`/covers/${step.cover}.jpg`} alt="" loading="lazy" />
            <h2>{step.title}</h2>
            <p>{step.copy}</p>
          </article>
        ))}
      </section>

      <footer className="landing-end">
        <h2>Start with one plan.</h2>
        <Link to="/register" className="ui-button ui-button--primary landing-primary">Create account</Link>
      </footer>
    </div>
  )
}
