import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="page-shell flex min-h-screen items-center justify-center px-4">
      <div className="surface-panel w-full max-w-md p-8 text-center">
        <p className="eyebrow">Błąd 404</p>
        <h1 className="page-title mt-2">Ta strona nie istnieje</h1>
        <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
          Adres, który próbujesz otworzyć, nie istnieje albo został przeniesiony.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-block rounded-[var(--radius-md)] px-4 py-3 text-sm font-semibold transition-all hover:opacity-90"
          style={{
            background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)',
            color: 'var(--accent-foreground)',
            boxShadow: '0 14px 32px rgba(90,166,255,0.22)',
          }}
        >
          Wróć do panelu
        </Link>
      </div>
    </div>
  )
}
