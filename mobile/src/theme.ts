import { palette } from '../../src/shared/palette'

// Named for native screens; the values live in src/shared/palette.ts, shared with the web.
export const colors = {
  background: palette.background,
  backgroundDeep: palette.backgroundDeep,
  backgroundElevated: palette.backgroundElevated,
  surface: palette.surface,
  surfaceRaised: palette.surfaceRaised,
  surfaceHigh: palette.surfaceHigh,
  line: palette.line,
  lineStrong: palette.lineStrong,
  text: palette.text,
  textStrong: palette.textStrong,
  muted: palette.muted,
  mutedSoft: palette.mutedSoft,
  accent: palette.bone, // fills, borders, indicators
  seam: palette.seam, // the mark, thin progress lines, the cut
  accentText: palette.text, // accent-coloured text and icons
  choiceSelected: palette.selected, // selected range, unit, goal, Coach tab
  primaryStart: palette.bone,
  primaryEnd: palette.bone,
  onPrimary: palette.ink, // label on the primary button
  recovery: palette.bone,
  recoveryBright: palette.text,
  warning: palette.warning,
  warningForeground: palette.warningForeground,
  steel: palette.steel,
} as const

// One title scale across the top-level screens, as on the web.
export const pageTitle = { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 28, lineHeight: 31, letterSpacing: -0.67 } as const

export const primaryGradient = `linear-gradient(180deg, ${colors.primaryStart} 0%, ${colors.primaryEnd} 100%)`
// The web body background.
export const pageBackground = `linear-gradient(180deg, ${palette.backgroundDeep} 0%, ${palette.background} 42%, ${palette.backgroundBottom} 100%)`
