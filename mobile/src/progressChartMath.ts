import { formatProgressVolume } from '../../src/shared/progress'
import { kgToDisplayWeight, type WeightUnits } from '../../src/shared/weightUnits'

export function progressChartValue(value: number, units: WeightUnits, kind: 'volume' | 'weight'): string {
  return kind === 'volume' ? formatProgressVolume(value, units) : `${kgToDisplayWeight(value, units)} ${units}`
}

export function progressChartTicks(values: number[], count: 3 | 5): number[] {
  const peak = Math.max(1, ...values)
  const roughStep = peak / (count - 1)
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const step = [1, 1.5, 2, 2.5, 3, 5, 10].find((candidate) => candidate * magnitude >= roughStep)! * magnitude
  return Array.from({ length: count }, (_, index) => (count - 1 - index) * step)
}

export function progressChartX(index: number, count: number, width: number): number {
  return count <= 1 ? width / 2 : index * width / (count - 1)
}

export function progressChartLabelIndices(count: number, kind: 'volume' | 'weight'): number[] {
  if (!count) return []
  if (kind === 'weight') return count <= 5 ? Array.from({ length: count }, (_, index) => index) : [0, Math.floor((count - 1) / 2), count - 1]
  const stride = count <= 5 ? 1 : count <= 13 ? 2 : 8
  return Array.from({ length: Math.ceil(count / stride) }, (_, index) => index * stride).filter((index) => index < count)
}

export function progressMonotonePath(values: number[], width: number, height: number, maximum: number): string {
  if (!values.length) return ''
  const points = values.map((value, index) => ({ x: progressChartX(index, values.length, width), y: height * (1 - value / maximum) }))
  if (points.length === 1) return `M${points[0]!.x},${points[0]!.y}`
  const slopes = points.slice(1).map((point, index) => (point.y - points[index]!.y) / (point.x - points[index]!.x))
  const tangent = points.map((_, index) => {
    if (index === 0) return slopes[0]!
    if (index === points.length - 1) return slopes.at(-1)!
    const before = slopes[index - 1]!
    const after = slopes[index]!
    return before * after <= 0 ? 0 : 2 * before * after / (before + after)
  })
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index]!
    const delta = (point.x - previous.x) / 3
    return `${path} C${previous.x + delta},${previous.y + tangent[index]! * delta} ${point.x - delta},${point.y - tangent[index + 1]! * delta} ${point.x},${point.y}`
  }, `M${points[0]!.x},${points[0]!.y}`)
}
