export type AnalyticsConsent = 'granted' | 'denied'

export const ANALYTICS_CONSENT_STORAGE_KEY = 'ironlog.analyticsConsent'

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getAnalyticsConsent(): AnalyticsConsent | null {
  if (!canUseStorage()) return null

  const value = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)
  if (value === 'granted' || value === 'denied') return value

  return null
}

export function setAnalyticsConsent(consent: AnalyticsConsent): AnalyticsConsent {
  if (!canUseStorage()) return consent

  window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, consent)
  return consent
}

export function clearAnalyticsConsent() {
  if (!canUseStorage()) return
  window.localStorage.removeItem(ANALYTICS_CONSENT_STORAGE_KEY)
}
