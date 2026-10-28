import { BRAND_MARK_SLIP } from '../../src/shared/brandMark'

type Bezier = (x1: number, y1: number, x2: number, y2: number) => (t: number) => number

const { times, offsets, ease } = BRAND_MARK_SLIP
const rest = offsets[offsets.length - 1]

// Native interpolation is piecewise linear, so every eased segment is sampled each 10 ms and one native-driven timing plays it all.
// `duration` past the slip holds the rest pose, which is how loaders pause before the next play.
export function slipFrames(duration: number, bezier: Bezier) {
  const inputRange: number[] = []
  const outputRange: number[] = []
  times.slice(1).forEach((to, index) => {
    const from = times[index]
    const curve = bezier(...ease[index])
    for (let ms = from; ms < to; ms += 10) {
      inputRange.push(ms / duration)
      outputRange.push(offsets[index] + (offsets[index + 1] - offsets[index]) * curve((ms - from) / (to - from)))
    }
  })
  const slipEnd = times[times.length - 1]
  if (duration > slipEnd) {
    inputRange.push(slipEnd / duration)
    outputRange.push(rest)
  }
  inputRange.push(1)
  outputRange.push(rest)
  return { inputRange, outputRange }
}
