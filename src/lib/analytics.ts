import ReactGA from 'react-ga4'
import Hotjar from '@hotjar/browser'
import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  type AnalyticsConsent,
} from './analyticsConsent'

// Oba ID są publiczne (trafiają do bundla jak każdy snippet analityczny),
// env służy tylko temu, żeby dev/preview nie zaśmiecały danych produkcyjnych.
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined
// Nowe konta Hotjar działają na platformie Contentsquare i zamiast numerycznego
// Site ID dostają tag identyfikowany hashem (https://t.contentsquare.net/uxa/<hash>.js).
const CSQ_TAG_ID = import.meta.env.VITE_CSQ_TAG_ID as string | undefined
// Starsze konta Hotjar (klasyczny numeryczny Site ID) — zostawione jako fallback.
const HOTJAR_SITE_ID = Number(import.meta.env.VITE_HOTJAR_SITE_ID)
const HOTJAR_VERSION = 6
const CSQ_SCRIPT_ID = 'ironlog-contentsquare-tag'

let gaReady = false
let sessionReplayReady = false

function hasConsent() {
  return getAnalyticsConsent() === 'granted'
}

function initGa() {
  if (!GA_MEASUREMENT_ID || gaReady) return
  ReactGA.initialize(GA_MEASUREMENT_ID)
  gaReady = true
}

function initSessionReplay() {
  if (sessionReplayReady || typeof document === 'undefined') return

  if (CSQ_TAG_ID) {
    if (!document.getElementById(CSQ_SCRIPT_ID)) {
      const script = document.createElement('script')
      script.id = CSQ_SCRIPT_ID
      script.src = `https://t.contentsquare.net/uxa/${CSQ_TAG_ID}.js`
      script.async = true
      document.head.appendChild(script)
    }
    sessionReplayReady = true
    return
  }

  if (Number.isInteger(HOTJAR_SITE_ID) && HOTJAR_SITE_ID > 0) {
    Hotjar.init(HOTJAR_SITE_ID, HOTJAR_VERSION)
    sessionReplayReady = true
  }
}

export function initAnalytics() {
  if (!hasConsent()) return
  initGa()
  initSessionReplay()
}

export function setAnalyticsConsentPreference(consent: AnalyticsConsent) {
  setAnalyticsConsent(consent)

  if (consent === 'granted') {
    initAnalytics()
    return
  }

  gaReady = false
}

export function grantAnalyticsConsent() {
  setAnalyticsConsentPreference('granted')
}

export function denyAnalyticsConsent() {
  setAnalyticsConsentPreference('denied')
}

// SPA nie przeładowuje strony przy nawigacji, więc pageview wysyłamy ręcznie
// przy każdej zmianie trasy (patrz components/AnalyticsListener).
export function trackPageView(path: string) {
  if (!hasConsent()) return

  initAnalytics()
  if (!gaReady) return

  ReactGA.send({ hitType: 'pageview', page: path })
}
