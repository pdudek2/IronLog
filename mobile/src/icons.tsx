import Svg, { Path } from 'react-native-svg'
import { colors } from './theme'

// Lucide-style strokes for the places that used text glyphs (⌄ ⌃ × ✓ ‹ › ＋).
const paths = {
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm18 15-6-6-6 6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  close: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  plus: 'M12 5v14M5 12h14',
} as const

export function Icon({ name, size = 16, color = colors.muted }: { name: keyof typeof paths; size?: number; color?: string }) {
  return <Svg accessibilityElementsHidden importantForAccessibility="no" width={size} height={size} viewBox="0 0 24 24">
    <Path d={paths[name]} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
}
