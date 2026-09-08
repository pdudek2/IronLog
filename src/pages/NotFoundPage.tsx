import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <section className="not-found-page" aria-labelledby="not-found-title">
      <div className="not-found-content">
        <p className="eyebrow">Error 404</p>
        <h1 id="not-found-title">Page not found</h1>
        <p>
          The page you are looking for does not exist or has moved.
        </p>
        <Link to="/dashboard" className="planner-primary-action">Back to dashboard</Link>
      </div>
    </section>
  )
}
