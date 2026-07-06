import { useState } from 'react'
import {
  denyAnalyticsConsent,
  grantAnalyticsConsent,
  trackPageView,
} from '../lib/analytics'
import { getAnalyticsConsent, type AnalyticsConsent } from '../lib/analyticsConsent'
import { Button } from './ui'

export default function AnalyticsConsentBanner() {
  const [consent, setConsent] = useState<AnalyticsConsent | null>(() => getAnalyticsConsent())

  if (consent !== null) return null

  function acceptAnalytics() {
    grantAnalyticsConsent()
    trackPageView(window.location.pathname + window.location.search)
    setConsent('granted')
  }

  function keepEssentialOnly() {
    denyAnalyticsConsent()
    setConsent('denied')
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 sm:pb-6">
      <section
        role="region"
        aria-label="Zgoda na analitykę"
        className="surface-panel mx-auto flex max-w-3xl flex-col gap-3 rounded-[var(--radius-xl)] p-3 shadow-2xl sm:ml-0 sm:mr-auto sm:max-w-xl sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Prywatność i analityka</p>
          <p className="mt-1 hidden text-sm leading-6 sm:block" style={{ color: 'var(--muted)' }}>
            Używamy GA4 i Contentsquare tylko po zgodzie, żeby mierzyć użycie aplikacji i poprawiać interfejs.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:items-center">
          <Button type="button" variant="ghost" onClick={keepEssentialOnly} className="px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm">
            <span className="sm:hidden">Niezbędne</span>
            <span className="hidden sm:inline">Tylko niezbędne</span>
          </Button>
          <Button type="button" onClick={acceptAnalytics} className="px-3 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm">
            <span className="sm:hidden">Akceptuję</span>
            <span className="hidden sm:inline">Akceptuję analitykę</span>
          </Button>
        </div>
      </section>
    </div>
  )
}
