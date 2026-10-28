import type { SlipTrack } from '../../src/shared/brandMark'

type Bezier = (x1: number, y1: number, x2: number, y2: number) => (t: number) => number

// Native interpolation is piecewise linear, so every eased segment is sampled each 10 ms and one native-driven timing plays it all.
export function slipFrames({ times, offsets, ease }: SlipTrack, bezier: Bezier) {
  const end = times[times.length - 1]
  const inputRange: number[] = []
  const outputRange: number[] = []
  times.slice(1).forEach((to, index) => {
    const from = times[index]
    const curve = bezier(...ease[index])
    for (let ms = from; ms < to; ms += 10) {
      inputRange.push(ms / end)
      outputRange.push(offsets[index] + (offsets[index + 1] - offsets[index]) * curve((ms - from) / (to - from)))
    }
  })
  inputRange.push(1)
  outputRange.push(offsets[offsets.length - 1])
  return { inputRange, outputRange }
}
