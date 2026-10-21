// Puls tokens mirrored from the web `:root` in src/index.css. Keep both in step.
export const colors = {
  background: '#111012', // --bg
  backgroundDeep: '#0b0a0c', // --puls-black-deep
  backgroundElevated: '#151316', // --bg-elevated
  surface: '#1a191c', // --surface-1
  surfaceRaised: '#211f23', // --surface-2
  surfaceHigh: '#2e2b30', // --surface-3
  line: 'rgba(244, 241, 242, 0.12)', // --border
  lineStrong: 'rgba(244, 241, 242, 0.2)', // --border-strong
  text: '#f4f1f2',
  textStrong: '#ffffff',
  muted: '#a09aa0',
  mutedSoft: '#8f8990',
  accent: '#f0435a', // fills, borders, indicators
  accentText: '#ff7182', // accent-coloured text and icons
  choiceSelected: '#3e242b', // --choice-selected-bg: selected range, unit, goal, Coach tab
  primaryStart: '#c72e44',
  primaryEnd: '#a91f35',
  recovery: '#8fb8a0', // --success
  recoveryBright: '#a7d8bb', // --puls-recovery-bright
  warning: '#f0a75a', // --danger
  warningForeground: '#221307', // --danger-foreground
  steel: '#8a94a6', // --puls-steel
} as const

export const primaryGradient = `linear-gradient(180deg, ${colors.primaryStart} 0%, ${colors.primaryEnd} 100%)`
// The web body background: red top-left, sage bottom-right over the deep black ramp.
export const pageBackground = 'linear-gradient(115deg, rgba(240, 67, 90, 0.055) 0%, transparent 26%, transparent 68%, rgba(143, 184, 160, 0.065) 100%), linear-gradient(180deg, #0b0a0c 0%, #111012 42%, #0d0c0e 100%)'
