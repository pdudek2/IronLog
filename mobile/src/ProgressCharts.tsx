import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg'

import { PROGRESS_MUSCLE_LABELS, strengthChartScale, type StrengthPoint, type SummaryWeek } from '../../src/shared/progress'
import { formatCompactVolume, formatShortVolume, kgToDisplayWeight, type WeightUnits } from '../../src/shared/weightUnits'
import { progressChartLabelIndices, progressChartTicks, progressChartValue, progressChartX, progressMonotonePath } from './progressChartMath'
import { colors } from './theme'

const muted = colors.muted
const accent = colors.accent

function Chart({ values, labels, units, width, kind, summary, onInspect, average = null }: { values: number[]; labels: string[]; units: WeightUnits; width: number; kind: 'volume' | 'weight'; summary: string; onInspect?: (index: number) => void; average?: number | null }) {
  const [selected, setSelected] = useState<number | null>(null)
  const bars = kind === 'volume'
  const axisWidth = bars ? 44 : 56
  const top = bars ? 22 : 12
  const plotWidth = Math.max(120, width - axisWidth - 10)
  const svgHeight = width / (bars ? 2.6 : 1.75)
  const frameHeight = Math.max(bars ? 0 : 160, svgHeight)
  const plotHeight = svgHeight - top - 38 // Recharts: bottom 8, X axis 30.
  const ticks = kind === 'weight' ? [...strengthChartScale(values).ticks].reverse() : progressChartTicks(values, 3)
  const upper = ticks[0]!
  const lower = ticks.at(-1)!
  const yAt = (value: number) => plotHeight * (1 - (value - lower) / (upper - lower))
  const path = progressMonotonePath(values, plotWidth, plotHeight, upper, lower)
  // Weekly volume is bucketed, so bars sit in bands (as on web); weight points run edge to edge.
  const band = plotWidth / Math.max(values.length, 1)
  const xAt = (index: number) => bars ? (index + 0.5) * band : progressChartX(index, values.length, plotWidth)
  const last = values.length - 1
  // The current week is always labelled ("so far"), so neighbours too close to it give way.
  const labelIndices = bars && last >= 0
    ? [...progressChartLabelIndices(labels.length, kind).filter((index) => xAt(last) - xAt(index) >= 44), last]
    : progressChartLabelIndices(labels.length, kind)
  const barWidth = Math.min(24, band * 0.6)
  // Axis values next to the average label would collide with it.
  const hiddenTick = (tick: number) => bars && (tick === 0 || (average !== null && Math.abs(tick - average) < average * 0.25))
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
      <View style={[styles.yLabels, { width: axisWidth, height: svgHeight }]}>
        {ticks.map((tick) => hiddenTick(tick) ? null : <Text key={tick} numberOfLines={1} adjustsFontSizeToFit style={[styles.axis, styles.yTick, { top: top - 8 + yAt(tick) }]}>{bars ? formatShortVolume(tick, units) : progressChartValue(tick, units, kind)}</Text>)}
        {average !== null && <Text numberOfLines={1} style={[styles.axis, styles.yTick, styles.now, { top: top - 8 + yAt(average) }]}>{formatShortVolume(average, units)}</Text>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${summary}${selected !== null && selectedValue != null ? ` Selected ${labels[selected]}: ${progressChartValue(selectedValue, units, kind)}.` : ''}`} accessibilityHint="Tap to inspect a chart point" style={{ width: plotWidth, height: svgHeight }} onPress={(event) => pick(event.nativeEvent.locationX)} onTouchMove={bars ? undefined : (event) => pick(event.nativeEvent.locationX)}>
        <Svg width={plotWidth} height={svgHeight} viewBox={`0 0 ${plotWidth} ${svgHeight}`}>
          <Defs><LinearGradient id="strengthFade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={accent} stopOpacity={0.16} /><Stop offset="1" stopColor={accent} stopOpacity={0} /></LinearGradient></Defs>
          <G y={top}>
          {ticks.filter((tick, index) => bars ? tick > 0 : svgHeight >= 165 || index % 2 === 0).map((tick) => <Line key={tick} x1="0" x2={plotWidth} y1={yAt(tick)} y2={yAt(tick)} stroke={bars ? 'rgba(244, 238, 232, 0.1)' : 'rgba(244, 238, 232, 0.05)'} />)}
          {bars && <Line x1="0" x2={plotWidth} y1={plotHeight} y2={plotHeight} stroke="rgba(244, 238, 232, 0.22)" />}
          {bars ? values.map((value, index) => {
            const height = plotHeight * value / upper
            const opacity = selected === null || selected === index ? 1 : 0.55
            // The current week is still filling up, so it is drawn as an outline.
            return index === last
              ? <Rect key={index} x={xAt(index) - barWidth / 2 + 0.75} y={plotHeight - height + 0.75} width={barWidth - 1.5} height={Math.max(0, height - 0.75)} rx={1.5} fill="none" stroke={accent} strokeWidth={1.5} opacity={opacity} />
              : <Rect key={index} x={xAt(index) - barWidth / 2} y={plotHeight - height} width={barWidth} height={height} rx={2} fill={accent} opacity={opacity} />
          }) : path ? <><Path d={`${path} L${plotWidth},${plotHeight} L0,${plotHeight} Z`} fill="url(#strengthFade)" /><Path d={path} fill="none" stroke={accent} strokeWidth={2} /></> : null}
          {average !== null && <Line x1="0" x2={plotWidth} y1={yAt(average)} y2={yAt(average)} stroke={muted} strokeDasharray="2 4" />}
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
      {bars && last >= 0 && <Text numberOfLines={1} style={[styles.axis, styles.now, styles.barValue, { left: axisWidth + xAt(last) + barWidth / 2 - 60, top: top - 20 + yAt(values[last]!) }]}>{formatShortVolume(values[last]!, units)}</Text>}
      <View style={[styles.xLabels, { left: axisWidth, top: top + 4 + plotHeight, width: plotWidth }]}>{labelIndices.map((index) => <Text key={`${labels[index]}:${index}`} numberOfLines={1} style={[styles.axis, styles.xTick, bars && index === last && styles.now, { left: bars && index === last ? xAt(index) + barWidth / 2 - 40 : xAt(index) - 20, textAlign: bars && index === last ? 'right' : 'center' }]}>{bars && index === last ? 'so far' : labels[index]}</Text>)}</View>
    </View>
    {bars && selected !== null && selectedValue != null && <Text accessibilityLiveRegion="polite" style={styles.inspection}>{labels[selected]} · {progressChartValue(selectedValue, units, kind)}</Text>}
  </View>
}

export function WeeklyVolumeChart({ weeks, average, units, width }: { weeks: SummaryWeek[]; average: number | null; units: WeightUnits; width: number }) {
  const full = weeks.filter((week) => !week.current)
  const averageText = average === null ? 'No full week yet.' : `Average ${formatCompactVolume(average, units)} per full week.`
  return <Chart values={weeks.map((week) => week.volume)} labels={weeks.map((week) => week.weekLabel)} average={average} units={units} width={width} kind="volume" summary={`Weekly volume, ${full.length} full ${full.length === 1 ? 'week' : 'weeks'}. ${averageText} This week so far ${formatCompactVolume(weeks.at(-1)?.volume ?? 0, units)}.`} />
}

export function StrengthChart({ points, keyName, units, width, onInspect }: { points: StrengthPoint[]; keyName: string; units: WeightUnits; width: number; onInspect: (index: number) => void }) {
  const values = points.map((point) => Number(point[keyName] ?? 0))
  return <Chart values={values} labels={points.map((point) => point.date)} units={units} width={width} kind="weight" onInspect={onInspect} summary={`Weight progression. Latest ${kgToDisplayWeight(values.at(-1) ?? 0, units)} ${units}, maximum ${kgToDisplayWeight(Math.max(...values), units)} ${units}.`} />
}

export function MuscleBars({ points }: { points: { muscle: string; sets: number }[] }) {
  const maximum = points[0]?.sets || 1
  return <View>
    {points.map((point) => <View key={point.muscle} accessible accessibilityLabel={`${PROGRESS_MUSCLE_LABELS[point.muscle] ?? point.muscle}: ${Math.round(point.sets)} sets`} style={styles.barRow}>
      <Text numberOfLines={1} style={styles.barLabel}>{PROGRESS_MUSCLE_LABELS[point.muscle] ?? point.muscle}</Text>
      <View style={styles.barTrack}><View style={[styles.bar, { width: `${point.sets / maximum * 100}%` }]} /></View>
      <Text style={styles.barCount}>{Math.round(point.sets)}</Text>
    </View>)}
  </View>
}


const styles = StyleSheet.create({
  chartRow: { flexDirection: 'row', alignItems: 'stretch' }, yLabels: { position: 'relative' }, axis: { color: muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11 }, yTick: { position: 'absolute', right: 7, width: 45, textAlign: 'right' },
  xLabels: { position: 'absolute', height: 18 }, xTick: { position: 'absolute', width: 40, textAlign: 'center' }, inspection: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, marginTop: 10 },
  now: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold' }, barValue: { position: 'absolute', width: 60, textAlign: 'right' },
  barRow: { flexDirection: 'row', alignItems: 'center', minHeight: 26 }, barLabel: { width: 96, color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 14.5 }, barTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(244, 238, 232, 0.1)' }, bar: { height: 3, borderRadius: 2, backgroundColor: accent }, barCount: { width: 44, color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14.5, textAlign: 'right', fontVariant: ['tabular-nums'] },
})
