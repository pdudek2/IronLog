import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg'

import { PROGRESS_MUSCLE_LABELS, formatProgressVolume, strengthChartScale, type MuscleBalancePoint, type StrengthPoint, type WeeklyPoint } from '../../src/shared/progress'
import { kgToDisplayWeight, type WeightUnits } from '../../src/shared/weightUnits'
import { progressChartLabelIndices, progressChartTicks, progressChartValue, progressChartX, progressMonotonePath } from './progressChartMath'
import { colors } from './theme'

const muted = colors.muted
const accent = colors.accent

function Chart({ values, labels, units, width, kind, summary, onInspect }: { values: number[]; labels: string[]; units: WeightUnits; width: number; kind: 'volume' | 'weight'; summary: string; onInspect?: (index: number) => void }) {
  const [selected, setSelected] = useState<number | null>(null)
  const axisWidth = kind === 'volume' ? 52 : 56
  const plotWidth = Math.max(120, width - axisWidth - 10)
  const svgHeight = width / (kind === 'volume' ? 2.15 : 1.75)
  const frameHeight = Math.max(160, svgHeight)
  const plotHeight = svgHeight - 50 // Recharts: top 12, bottom 8, X axis 30.
  const ticks = kind === 'weight' ? [...strengthChartScale(values).ticks].reverse() : progressChartTicks(values, plotWidth >= 260 ? 5 : 3)
  const upper = ticks[0]!
  const lower = ticks.at(-1)!
  const yAt = (value: number) => plotHeight * (1 - (value - lower) / (upper - lower))
  const path = progressMonotonePath(values, plotWidth, plotHeight, upper, lower)
  const labelIndices = progressChartLabelIndices(labels.length, kind)
  // Weekly volume is bucketed, so bars sit in bands (as on web); weight points run edge to edge.
  const bars = kind === 'volume'
  const band = plotWidth / Math.max(values.length, 1)
  const xAt = (index: number) => bars ? (index + 0.5) * band : progressChartX(index, values.length, plotWidth)
  const selectedValue = selected === null ? null : values[selected]
  const pick = (locationX: number) => {
    const fraction = Math.max(0, Math.min(1, locationX / plotWidth))
    const index = bars ? Math.min(values.length - 1, Math.floor(fraction * values.length)) : Math.round(fraction * Math.max(0, values.length - 1))
    setSelected(index)
    onInspect?.(index)
  }
  return <View accessibilityLabel={kind === 'volume' ? 'Weekly workout volume chart' : 'Weight progression chart'}>
    <View style={{ height: frameHeight }}>
      <View style={[styles.chartRow, { height: svgHeight }]}>
      <View style={[styles.yLabels, { width: axisWidth, height: svgHeight }]}>{ticks.map((tick, index) => <Text key={tick} numberOfLines={1} adjustsFontSizeToFit style={[styles.axis, styles.yTick, { top: 4 + index * plotHeight / (ticks.length - 1) }]}>{progressChartValue(tick, units, kind)}</Text>)}</View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${summary}${selected !== null && selectedValue != null ? ` Selected ${labels[selected]}: ${progressChartValue(selectedValue, units, kind)}.` : ''}`} accessibilityHint="Tap to inspect a chart point" style={{ width: plotWidth, height: svgHeight }} onPress={(event) => pick(event.nativeEvent.locationX)} onTouchMove={bars ? undefined : (event) => pick(event.nativeEvent.locationX)}>
        <Svg width={plotWidth} height={svgHeight} viewBox={`0 0 ${plotWidth} ${svgHeight}`}>
          <Defs><LinearGradient id="strengthFade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={accent} stopOpacity={0.16} /><Stop offset="1" stopColor={accent} stopOpacity={0} /></LinearGradient></Defs>
          <G y={12}>
          {ticks.filter((_, index) => kind !== 'weight' || svgHeight >= 165 || index % 2 === 0).map((tick) => <Line key={tick} x1="0" x2={plotWidth} y1={yAt(tick)} y2={yAt(tick)} stroke="rgba(244, 238, 232, 0.05)" />)}
          {bars ? values.map((value, index) => {
            const barWidth = Math.min(28, band * 0.6), height = plotHeight * value / upper
            return <Rect key={index} x={xAt(index) - barWidth / 2} y={plotHeight - height} width={barWidth} height={height} rx={4} fill={index === values.length - 1 ? accent : 'rgba(239, 232, 223, 0.22)'} opacity={selected === null || selected === index ? 1 : 0.55} />
          }) : path ? <><Path d={`${path} L${plotWidth},${plotHeight} L0,${plotHeight} Z`} fill="url(#strengthFade)" /><Path d={path} fill="none" stroke={accent} strokeWidth={2} /></> : null}
          {kind === 'weight' && values.map((value, index) => {
            const x = progressChartX(index, values.length, plotWidth)
            return <Circle key={index} cx={x} cy={yAt(value)} r={2.5} fill={accent} />
          })}
          {!bars && selected !== null && selectedValue != null && <>
            <Line x1={progressChartX(selected, values.length, plotWidth)} x2={progressChartX(selected, values.length, plotWidth)} y1={0} y2={plotHeight} stroke="rgba(244, 238, 232,0.3)" />
            <Circle cx={progressChartX(selected, values.length, plotWidth)} cy={yAt(selectedValue)} r={5} fill={accent} stroke={colors.background} strokeWidth={2} />
          </>}
          </G>
        </Svg>
      </Pressable>
      </View>
      <View style={[styles.xLabels, { left: axisWidth, top: 16 + plotHeight, width: plotWidth }]}>{labelIndices.map((index) => <Text key={`${labels[index]}:${index}`} numberOfLines={1} style={[styles.axis, styles.xTick, { left: xAt(index) - 20 }]}>{labels[index]}</Text>)}</View>
    </View>
    {bars && selected !== null && selectedValue != null && <Text accessibilityLiveRegion="polite" style={styles.inspection}>{labels[selected]} · {progressChartValue(selectedValue, units, kind)}</Text>}
  </View>
}

export function WeeklyVolumeChart({ points, units, width }: { points: WeeklyPoint[]; units: WeightUnits; width: number }) {
  const peak = points.reduce((best, point) => point.volume > best.volume ? point : best, points[0]!)
  const total = points.reduce((sum, point) => sum + point.volume, 0)
  return <Chart values={points.map((point) => point.volume)} labels={points.map((point) => point.weekLabel)} units={units} width={width} kind="volume" summary={`Weekly volume from ${points[0]?.weekLabel} to ${points.at(-1)?.weekLabel}. Total ${formatProgressVolume(total, units)}. Highest week ${peak.weekLabel}: ${formatProgressVolume(peak.volume, units)}.`} />
}

export function StrengthChart({ points, keyName, units, width, onInspect }: { points: StrengthPoint[]; keyName: string; units: WeightUnits; width: number; onInspect: (index: number) => void }) {
  const values = points.map((point) => Number(point[keyName] ?? 0))
  return <Chart values={values} labels={points.map((point) => point.date)} units={units} width={width} kind="weight" onInspect={onInspect} summary={`Weight progression. Latest ${kgToDisplayWeight(values.at(-1) ?? 0, units)} ${units}, maximum ${kgToDisplayWeight(Math.max(...values), units)} ${units}.`} />
}

export function MuscleBars({ points }: { points: MuscleBalancePoint[] }) {
  const maximum = Math.max(1, ...points.map((point) => point.count))
  return <View accessibilityLabel="Muscle group balance">
    {points.map((point) => <View key={point.muscle} accessible accessibilityLabel={`${PROGRESS_MUSCLE_LABELS[point.muscle] ?? point.muscle}: ${point.count} entries`} style={styles.barRow}>
      <Text numberOfLines={1} style={styles.barLabel}>{PROGRESS_MUSCLE_LABELS[point.muscle] ?? point.muscle}</Text>
      <View style={styles.barTrack}><View style={[styles.bar, { width: `${point.count / maximum * 100}%` }]} /></View>
      <Text style={styles.barCount}>{point.count}</Text>
    </View>)}
  </View>
}


const styles = StyleSheet.create({
  chartRow: { flexDirection: 'row', alignItems: 'stretch' }, yLabels: { position: 'relative' }, axis: { color: muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11 }, yTick: { position: 'absolute', right: 7, width: 45, textAlign: 'right' },
  xLabels: { position: 'absolute', height: 18 }, xTick: { position: 'absolute', width: 40, textAlign: 'center' }, inspection: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, marginTop: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 30 }, barLabel: { width: 96, color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 }, barTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255, 255, 255, 0.07)' }, bar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(239, 232, 223, 0.7)' }, barCount: { width: 32, color: muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 14, textAlign: 'right', fontVariant: ['tabular-nums'] },
})
