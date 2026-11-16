const LANDING_PLAN_KEY = 'ironlog:landing-plan'

// A plan pasted on the landing waits in this browser until the new account saves it.
export function saveLandingPlan(text: string) {
  try { window.localStorage.setItem(LANDING_PLAN_KEY, text) } catch { /* storage blocked: the account starts empty */ }
}

export function readLandingPlan(): string | null {
  try { return window.localStorage.getItem(LANDING_PLAN_KEY) } catch { return null }
}

export function clearLandingPlan() {
  try { window.localStorage.removeItem(LANDING_PLAN_KEY) } catch { /* nothing to clear */ }
}
