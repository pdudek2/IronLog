import ReactGA from 'react-ga4'
import Hotjar from '@hotjar/browser'

// Oba ID są publiczne (trafiają do bundla jak każdy snippet analityczny),
// env służy tylko temu, żeby dev/preview nie zaśmiecały danych produkcyjnych.
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined
const HOTJAR_SITE_ID = Number(import.meta.env.VITE_HOTJAR_SITE_ID)
const HOTJAR_VERSION = 6

let gaReady = false

export function initAnalytics() {
  if (GA_MEASUREMENT_ID) {
    ReactGA.initialize(GA_MEASUREMENT_ID)
    gaReady = true
  }
  if (Number.isInteger(HOTJAR_SITE_ID) && HOTJAR_SITE_ID > 0) {
    Hotjar.init(HOTJAR_SITE_ID, HOTJAR_VERSION)
  }
}

// SPA nie przeładowuje strony przy nawigacji, więc pageview wysyłamy ręcznie
// przy każdej zmianie trasy (patrz components/AnalyticsListener).
export function trackPageView(path: string) {
  if (!gaReady) return
  ReactGA.send({ hitType: 'pageview', page: path })
}
