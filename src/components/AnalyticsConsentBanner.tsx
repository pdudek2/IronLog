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
        className="surface-panel mx-auto flex max-w-3xl flex-col gap-4 rounded-[var(--radius-xl)] p-4 shadow-2xl sm:flex-row sm:items-center sm:justify-between sm:p-5"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Prywatność i analityka</p>
          <p className="mt-1 text-sm leading-6" style={{ color: 'var(--muted)' }}>
            Używamy GA4 i Contentsquare tylko po zgodzie, żeby mierzyć użycie aplikacji i poprawiać interfejs.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="button" variant="ghost" onClick={keepEssentialOnly}>
            Tylko niezbędne
          </Button>
          <Button type="button" onClick={acceptAnalytics}>
            Akceptuję analitykę
          </Button>
        </div>
      </section>
    </div>
  )
}
