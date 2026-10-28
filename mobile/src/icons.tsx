import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import { BRAND_MARK, BRAND_MARK_SLIP } from '../../src/shared/brandMark'
import { slipFrames } from './brandSlip'
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

// The SHEAR mark, same geometry as the web header and the app icon.
// `slip` plays the slip once, for a moment like a new record; reduced motion keeps the static mark.
export function BrandMark({ width = 20, slip = false }: { width?: number; slip?: boolean }) {
  if (slip) return <SlipBrandMark width={width} />
  return <Svg accessibilityElementsHidden importantForAccessibility="no" width={width} height={width * 480 / 540} viewBox={BRAND_MARK.viewBox}>
    <Path d={BRAND_MARK.upper} fill={colors.textStrong} />
    <Rect {...BRAND_MARK.cut} fill={colors.accent} />
    <Path d={BRAND_MARK.lower} fill={colors.textStrong} />
  </Svg>
}

const { times, cover, red, seam, clip } = BRAND_MARK_SLIP
const duration = times[times.length - 1]
const frames = slipFrames(BRAND_MARK_SLIP, Easing.bezier)

// Stacked layers so the native driver can move them: SVG props would need the JS thread, which is busy at startup.
function SlipBrandMark({ width }: { width: number }) {
  const [reduced, setReduced] = useState<boolean | null>(null)
  const progress = useRef(new Animated.Value(0)).current
  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReduced(value) })
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => { mounted = false; subscription.remove() }
  }, [])
  useEffect(() => {
    if (reduced !== false) return
    const animation = Animated.timing(progress, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })
    animation.start()
    return () => animation.stop()
  }, [reduced, progress])

  if (reduced) return <BrandMark width={width} />
  const scale = width / 540
  const height = width * 480 / 540
  const layer = { position: 'absolute', left: 0, top: 0, width, height } as const
  const slide = { transform: [{ translateX: progress.interpolate({ inputRange: frames.inputRange, outputRange: frames.outputRange.map((offset) => offset * scale) }) }] }
  const fade = (track: { times: readonly number[]; opacity: readonly number[] }) => ({ opacity: progress.interpolate({ inputRange: track.times.map((ms) => ms / duration), outputRange: [...track.opacity] }) })
  const seamCover = fade(cover)
  const seamRed = fade(red)
  const layerSvg = (children: React.ReactNode) => <Svg width={width} height={height} viewBox={BRAND_MARK.viewBox}>{children}</Svg>
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width, height }}>
    <View style={layer}>{layerSvg(<Path d={BRAND_MARK.lower} fill={colors.textStrong} />)}</View>
    {/* The seam moves with the upper part; clipped to the lower part's span (which starts at the left edge) it is their overlap. */}
    <View style={{ ...layer, overflow: 'hidden', width: clip.width * scale }}>
      <Animated.View style={[layer, slide]}>
        <Animated.View style={[layer, seamRed]}>{layerSvg(<Rect {...seam} fill={colors.accent} />)}</Animated.View>
        {/* Overlaps the halves by half a seam so the whole block shows no antialiased hairline. */}
        <Animated.View style={[layer, seamCover]}>{layerSvg(<Rect x={seam.x} y={seam.y - seam.height / 2} width={seam.width} height={seam.height * 2} fill={colors.textStrong} />)}</Animated.View>
      </Animated.View>
    </View>
    <Animated.View style={[layer, slide]}>{layerSvg(<Path d={BRAND_MARK.upper} fill={colors.textStrong} />)}</Animated.View>
  </View>
}
