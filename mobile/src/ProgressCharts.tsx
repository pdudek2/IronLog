import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg'

import { PROGRESS_HEATMAP_COLORS, PROGRESS_MUSCLE_COLORS, PROGRESS_MUSCLE_LABELS, formatProgressVolume, type HeatmapDay, type MuscleBalancePoint, type StrengthPoint, type WeeklyPoint } from '../../src/shared/progress'
import { kgToDisplayWeight, type WeightUnits } from '../../src/shared/weightUnits'
import { progressChartLabelIndices, progressChartTicks, progressChartValue, progressChartX, progressMonotonePath } from './progressChartMath'
import { colors } from './theme'

const muted = colors.muted
const accent = colors.accent

function Chart({ values, labels, units, width, kind, summary }: { values: number[]; labels: string[]; units: WeightUnits; width: number; kind: 'volume' | 'weight'; summary: string }) {
  const [selected, setSelected] = useState<number | null>(null)
  const axisWidth = kind === 'volume' ? 52 : 56
  const plotWidth = Math.max(120, width - axisWidth - 10)
  const svgHeight = width / (kind === 'volume' ? 2.15 : 2.05)
  const frameHeight = Math.max(160, svgHeight)
  const plotHeight = svgHeight - 50 // Recharts: top 12, bottom 8, X axis 30.
  const ticks = progressChartTicks(values, kind === 'weight' || plotWidth >= 260 ? 5 : 3)
  const upper = ticks[0]!
  const path = progressMonotonePath(values, plotWidth, plotHeight, upper)
  const labelIndices = progressChartLabelIndices(labels.length, kind)
  // Weekly volume is bucketed, so bars sit in bands (as on web); weight points run edge to edge.
  const bars = kind === 'volume'
  const band = plotWidth / Math.max(values.length, 1)
  const xAt = (index: number) => bars ? (index + 0.5) * band : progressChartX(index, values.length, plotWidth)
  const selectedValue = selected === null ? null : values[selected]
  return <View accessibilityLabel={kind === 'volume' ? 'Weekly workout volume chart' : 'Weight progression chart'}>
    <View style={{ height: frameHeight }}>
      <View style={[styles.chartRow, { height: svgHeight }]}>
      <View style={[styles.yLabels, { width: axisWidth, height: svgHeight }]}>{ticks.map((tick, index) => <Text key={tick} numberOfLines={1} adjustsFontSizeToFit style={[styles.axis, styles.yTick, { top: 4 + index * plotHeight / (ticks.length - 1) }]}>{progressChartValue(tick, units, kind)}</Text>)}</View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${summary}${selected !== null && selectedValue != null ? ` Selected ${labels[selected]}: ${progressChartValue(selectedValue, units, kind)}.` : ''}`} accessibilityHint="Tap to inspect a chart point" style={{ width: plotWidth, height: svgHeight }} onPress={(event) => {
        const fraction = Math.max(0, Math.min(1, event.nativeEvent.locationX / plotWidth))
        setSelected(bars ? Math.min(values.length - 1, Math.floor(fraction * values.length)) : Math.round(fraction * Math.max(0, values.length - 1)))
      }}>
        <Svg width={plotWidth} height={svgHeight} viewBox={`0 0 ${plotWidth} ${svgHeight}`}>
          <G y={12}>
          {ticks.filter((_, index) => kind !== 'weight' || svgHeight >= 165 || index % 2 === 0).map((tick) => <Line key={tick} x1="0" x2={plotWidth} y1={(1 - tick / upper) * plotHeight} y2={(1 - tick / upper) * plotHeight} stroke="rgba(244,241,242,0.085)" strokeDasharray="3,3" />)}
          {bars ? values.map((value, index) => {
            const barWidth = Math.min(28, band * 0.6), height = plotHeight * value / upper
            return <Rect key={index} x={xAt(index) - barWidth / 2} y={plotHeight - height} width={barWidth} height={height} rx={2} fill={accent} opacity={selected === null || selected === index ? 1 : 0.55} />
          }) : path ? <Path d={path} fill="none" stroke={accent} strokeWidth={2.4} /> : null}
          {kind === 'weight' && values.map((value, index) => {
            const x = progressChartX(index, values.length, plotWidth)
            const y = plotHeight * (1 - value / upper)
            return <Circle key={index} cx={x} cy={y} r={3} fill={accent} />
          })}
          {!bars && selected !== null && selectedValue != null && <Circle cx={progressChartX(selected, values.length, plotWidth)} cy={plotHeight * (1 - selectedValue / upper)} r={5} fill={accent} stroke={colors.textStrong} strokeWidth={1} />}
          </G>
        </Svg>
      </Pressable>
      </View>
      <View style={[styles.xLabels, { left: axisWidth, top: 16 + plotHeight, width: plotWidth }]}>{labelIndices.map((index) => <Text key={`${labels[index]}:${index}`} numberOfLines={1} style={[styles.axis, styles.xTick, { left: xAt(index) - 20 }]}>{labels[index]}</Text>)}</View>
    </View>
    {selected !== null && selectedValue != null && <Text accessibilityLiveRegion="polite" style={styles.inspection}>{labels[selected]} · {progressChartValue(selectedValue, units, kind)}</Text>}
  </View>
}

export function WeeklyVolumeChart({ points, units, width }: { points: WeeklyPoint[]; units: WeightUnits; width: number }) {
  const peak = points.reduce((best, point) => point.volume > best.volume ? point : best, points[0]!)
  const total = points.reduce((sum, point) => sum + point.volume, 0)
  return <Chart values={points.map((point) => point.volume)} labels={points.map((point) => point.weekLabel)} units={units} width={width} kind="volume" summary={`Weekly volume from ${points[0]?.weekLabel} to ${points.at(-1)?.weekLabel}. Total ${formatProgressVolume(total, units)}. Highest week ${peak.weekLabel}: ${formatProgressVolume(peak.volume, units)}.`} />
}

export function StrengthChart({ points, keyName, units, width }: { points: StrengthPoint[]; keyName: string; units: WeightUnits; width: number }) {
  const values = points.map((point) => Number(point[keyName] ?? 0))
  return <Chart values={values} labels={points.map((point) => point.date)} units={units} width={width} kind="weight" summary={`Weight progression. Latest ${kgToDisplayWeight(values.at(-1) ?? 0, units)} ${units}, maximum ${kgToDisplayWeight(Math.max(...values), units)} ${units}.`} />
}

export function MuscleBars({ points }: { points: MuscleBalancePoint[] }) {
  const maximum = Math.max(1, ...points.map((point) => point.count))
  const ticks = progressChartTicks([maximum], 5).reverse()
  const upper = ticks.at(-1)!
  const [selected, setSelected] = useState<string | null>(null)
  return <View accessibilityLabel="Muscle group balance" style={styles.bars}>
    <View pointerEvents="none" style={styles.muscleGrid}>{ticks.map((tick) => <View key={tick} style={[styles.muscleGridLine, { left: `${tick / upper * 100}%` }]} />)}</View>
    {points.map((point) => <Pressable key={point.muscle} accessibilityRole="button" accessibilityLabel={`${PROGRESS_MUSCLE_LABELS[point.muscle] ?? point.muscle}: ${point.count} entries`} onPress={() => setSelected(point.muscle)} style={styles.barRow}>
    <Text numberOfLines={1} style={styles.barLabel}>{PROGRESS_MUSCLE_LABELS[point.muscle] ?? point.muscle}</Text>
    <View style={styles.barTrack}><View style={[styles.bar, { width: `${point.count / upper * 100}%`, backgroundColor: PROGRESS_MUSCLE_COLORS[point.muscle] ?? accent }]} /></View>
  </Pressable>)}
    <View style={styles.muscleAxis}>{ticks.map((tick) => <Text key={tick} style={[styles.axis, styles.muscleTick, { left: `${tick / upper * 100}%` }]}>{tick}</Text>)}</View>
    {selected && <Text accessibilityLiveRegion="polite" style={styles.inspection}>{PROGRESS_MUSCLE_LABELS[selected] ?? selected}: {points.find((point) => point.muscle === selected)?.count ?? 0} entries</Text>}
  </View>
}

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export function ActivityCalendar({ cells, selectedDate, onSelect, units }: { cells: HeatmapDay[]; selectedDate: string | null; onSelect: (date: string) => void; units: WeightUnits }) {
  const months = Array.from({ length: 12 }, (_, week) => {
    const monday = cells.find((cell) => cell.weekIndex === week && cell.dayOfWeek === 0 && cell.date)
    const previous = cells.find((cell) => cell.weekIndex === week - 1 && cell.dayOfWeek === 0 && cell.date)
    const month = monday ? new Date(`${monday.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short' }) : ''
    const prior = previous ? new Date(`${previous.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short' }) : ''
    return week === 0 || month !== prior ? month : ''
  })
  return <View accessibilityLabel="Workout calendar for the last 12 weeks">
    <View style={styles.calendarMonths}><View style={styles.dayLabel} />{months.map((month, index) => <View key={index} style={styles.monthColumn}>{month ? <Text numberOfLines={1} style={styles.month}>{month}</Text> : null}</View>)}</View>
    {days.map((day, dayIndex) => <View key={day} style={styles.calendarRow}><Text style={styles.dayLabel}>{dayIndex % 2 ? '' : day}</Text>{Array.from({ length: 12 }, (_, week) => {
      const cell = cells[week * 7 + dayIndex]
      return <Pressable key={week} accessibilityRole="button" accessibilityLabel={cell?.date ? `${cell.date}, ${formatProgressVolume(cell.volume, units)}` : 'Future day'} disabled={!cell?.date || cell.volume <= 0} onPress={() => onSelect(cell!.date)} style={[styles.cell, { backgroundColor: PROGRESS_HEATMAP_COLORS[cell?.level ?? 0] }, selectedDate === cell?.date && cell?.volume > 0 && styles.selectedCell]} />
    })}</View>)}
  </View>
}

export function ActivityCalendarScale() {
  return <View style={styles.scale}><Text style={styles.scaleText}>Less</Text>{PROGRESS_HEATMAP_COLORS.map((color) => <View key={color} style={[styles.scaleCell, { backgroundColor: color }]} />)}<Text style={styles.scaleText}>More</Text></View>
}

const styles = StyleSheet.create({
  chartRow: { flexDirection: 'row', alignItems: 'stretch' }, yLabels: { position: 'relative' }, axis: { color: muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11 }, yTick: { position: 'absolute', right: 7, width: 45, textAlign: 'right' },
  xLabels: { position: 'absolute', height: 18 }, xTick: { position: 'absolute', width: 40, textAlign: 'center' }, inspection: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, marginTop: 10 },
  bars: { position: 'relative' }, muscleGrid: { position: 'absolute', left: 86, right: 0, top: 0, bottom: 20 }, muscleGridLine: { position: 'absolute', top: 0, bottom: 0, width: 1, borderLeftColor: 'rgba(244,241,242,0.085)', borderLeftWidth: 1, borderStyle: 'dashed' }, barRow: { flexDirection: 'row', alignItems: 'center', height: 34 }, barLabel: { width: 86, paddingRight: 7, color: muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11, textAlign: 'right' }, barTrack: { flex: 1, height: 18 }, bar: { height: 18, borderTopRightRadius: 4, borderBottomRightRadius: 4 }, muscleAxis: { position: 'relative', height: 20, marginLeft: 86 }, muscleTick: { position: 'absolute', width: 22, marginLeft: -11, textAlign: 'center' },
  calendarMonths: { flexDirection: 'row', gap: 3, marginBottom: 7 }, calendarRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 }, dayLabel: { width: 30, color: muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11, textAlign: 'right' }, monthColumn: { flex: 1, height: 15 }, month: { position: 'absolute', left: 0, width: 40, color: muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11 }, cell: { flex: 1, aspectRatio: 1, borderRadius: 3 }, selectedCell: { borderColor: colors.textStrong, borderWidth: 1 }, scale: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 5, marginTop: 10 }, scaleText: { color: muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11 }, scaleCell: { width: 11, height: 11, borderRadius: 2 },
})
