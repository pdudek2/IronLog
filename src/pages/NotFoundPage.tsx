import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <section className="not-found-page" aria-labelledby="not-found-title">
      <div className="not-found-content">
        <p className="eyebrow">Błąd 404</p>
        <h1 id="not-found-title">Ta strona nie istnieje</h1>
        <p>
          Adres, który próbujesz otworzyć, nie istnieje albo został przeniesiony.
        </p>
        <Link to="/dashboard" className="planner-primary-action">Wróć do panelu</Link>
      </div>
    </section>
  )
}
