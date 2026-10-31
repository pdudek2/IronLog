// The one source of colour for web and native. mobile/src/theme.ts reads it directly;
// the web gets src/palette.generated.css from it through `npm run tokens`.
export const palette = {
  background: '#141110',
  backgroundDeep: '#0d0b0a',
  backgroundBottom: '#0f0d0c',
  backgroundElevated: '#181412',
  surface: '#1c1816',
  surfaceRaised: '#26211e',
  surfaceHigh: '#322c28',
  bone: '#efe7dc',
  ink: '#1b1613',
  seam: '#f0435a',
  text: '#f4eee8',
  textStrong: '#fbf7f2',
  muted: '#a89f98',
  mutedSoft: '#94897f',
  line: 'rgba(244, 238, 232, 0.12)',
  lineStrong: 'rgba(244, 238, 232, 0.2)',
  selected: '#3a342f',
  warning: '#f0a75a',
  warningForeground: '#221307',
  steel: '#8a94a6',
} as const

const cssVariables: Record<string, keyof typeof palette> = {
  '--puls-black': 'background',
  '--puls-black-deep': 'backgroundDeep',
  '--puls-black-bottom': 'backgroundBottom',
  '--bg-elevated': 'backgroundElevated',
  '--puls-surface-1': 'surface',
  '--puls-surface-2': 'surfaceRaised',
  '--puls-surface-3': 'surfaceHigh',
  '--puls-bone': 'bone',
  '--puls-ink': 'ink',
  '--seam': 'seam',
  '--text': 'text',
  '--text-strong': 'textStrong',
  '--muted': 'muted',
  '--muted-soft': 'mutedSoft',
  '--border': 'line',
  '--border-strong': 'lineStrong',
  '--puls-warning': 'warning',
  '--puls-steel': 'steel',
}

export function paletteCss(): string {
  const lines = Object.entries(cssVariables).map(([name, key]) => `  ${name}: ${palette[key]};`)
  return `/* Generated from src/shared/palette.ts by \`npm run tokens\`. Do not edit. */\n:root {\n${lines.join('\n')}\n}\n`
}
