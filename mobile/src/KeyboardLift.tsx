import type { ViewProps } from 'react-native'
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated'

// Keeps `rest` of room below its content and, once the keyboard is taller than that, rides the keyboard top
// `gap` above it, frame by frame. The keyboard height includes the navigation bar (edge to edge).
export function KeyboardLift({ rest, gap = 0, style, ...props }: ViewProps & { rest: number; gap?: number }) {
  const { height } = useReanimatedKeyboardAnimation()
  const lift = useAnimatedStyle(() => ({ paddingBottom: Math.max(rest, gap - height.value) }), [rest, gap])
  return <Reanimated.View {...props} style={[style, lift]} />
}
