import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg'

import { PROGRESS_HEATMAP_COLORS, PROGRESS_MUSCLE_COLORS, PROGRESS_MUSCLE_LABELS, formatProgressVolume, type HeatmapDay, type MuscleBalancePoint, type StrengthPoint, type WeeklyPoint } from '../../src/shared/progress'
import { kgToDisplayWeight, type WeightUnits } from '../../src/shared/weightUnits'
import { progressChartLabelIndices, progressChartTicks, progressChartValue, progressChartX, progressMonotonePath } from './progressChartMath'

const muted = '#a09aa0'
const accent = '#f0435a'

function Chart({ values, labels, units, width, kind, summary }: { values: number[]; labels: string[]; units: WeightUnits; width: number; kind: 'volume' | 'weight'; summary: string }) {
  const [selected, setSelected] = useState<number | null>(null)
  const axisWidth = kind === 'volume' ? 52 : 56
  const plotWidth = Math.max(120, width - axisWidth - 10)
  const frameHeight = Math.max(160, Math.round(width / (kind === 'volume' ? 2.15 : 2.05)))
  const plotHeight = frameHeight - 62
  const ticks = progressChartTicks(values, kind === 'weight' || plotWidth >= 260 ? 5 : 3)
  const upper = ticks[0]!
  const path = progressMonotonePath(values, plotWidth, plotHeight, upper)
  const labelIndices = progressChartLabelIndices(labels.length, kind)
  const selectedValue = selected === null ? null : values[selected]
  return <View accessibilityLabel={kind === 'volume' ? 'Weekly workout volume chart' : 'Weight progression chart'}>
    <View style={{ height: frameHeight, paddingTop: 12 }}>
      <View style={styles.chartRow}>
      <View style={[styles.yLabels, { width: axisWidth, height: plotHeight }]}>{ticks.map((tick, index) => <Text key={tick} numberOfLines={1} adjustsFontSizeToFit style={[styles.axis, styles.yTick, { top: Math.max(0, Math.min(plotHeight - 14, index * plotHeight / (ticks.length - 1) - 7)) }]}>{progressChartValue(tick, units, kind)}</Text>)}</View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${summary}${selected !== null && selectedValue != null ? ` Selected ${labels[selected]}: ${progressChartValue(selectedValue, units, kind)}.` : ''}`} accessibilityHint="Tap to inspect a chart point" style={{ width: plotWidth, height: plotHeight }} onPress={(event) => {
        const fraction = Math.max(0, Math.min(1, event.nativeEvent.locationX / plotWidth))
        setSelected(Math.round(fraction * Math.max(0, values.length - 1)))
      }}>
        <Svg width={plotWidth} height={plotHeight} viewBox={`0 0 ${plotWidth} ${plotHeight}`}>
          <Defs><LinearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={accent} stopOpacity="0.35" /><Stop offset="1" stopColor={accent} stopOpacity="0" /></LinearGradient></Defs>
          {ticks.map((tick) => <Line key={tick} x1="0" x2={plotWidth} y1={(1 - tick / upper) * plotHeight} y2={(1 - tick / upper) * plotHeight} stroke="rgba(244,241,242,0.085)" strokeDasharray="3,3" />)}
          {kind === 'volume' && path ? <Path d={`${path} L${plotWidth},${plotHeight} L0,${plotHeight} Z`} fill="url(#chartFill)" /> : null}
          {path ? <Path d={path} fill="none" stroke={accent} strokeWidth={2.4} /> : null}
          {kind === 'weight' && values.map((value, index) => {
            const x = progressChartX(index, values.length, plotWidth)
            const y = plotHeight * (1 - value / upper)
            return <Circle key={index} cx={x} cy={y} r={3} fill={accent} />
          })}
          {selected !== null && selectedValue != null && <Circle cx={progressChartX(selected, values.length, plotWidth)} cy={plotHeight * (1 - selectedValue / upper)} r={5} fill={accent} stroke="#fff" strokeWidth={1} />}
        </Svg>
      </Pressable>
      </View>
      <View style={[styles.xLabels, { marginLeft: axisWidth, width: plotWidth }]}>{labelIndices.map((index) => <Text key={`${labels[index]}:${index}`} numberOfLines={1} style={[styles.axis, styles.xTick, { left: progressChartX(index, labels.length, plotWidth) - 20 }]}>{labels[index]}</Text>)}</View>
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
    <View style={styles.calendarMonths}><View style={styles.dayLabel} />{months.map((month, index) => <Text key={index} style={styles.month}>{month}</Text>)}</View>
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
  chartRow: { flexDirection: 'row', alignItems: 'stretch' }, yLabels: { position: 'relative' }, axis: { color: muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 10 }, yTick: { position: 'absolute', right: 7, width: 45, textAlign: 'right' },
  xLabels: { position: 'relative', marginTop: 7, height: 18 }, xTick: { position: 'absolute', width: 40, textAlign: 'center' }, inspection: { color: '#f4f1f2', fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, marginTop: 10 },
  bars: { position: 'relative' }, muscleGrid: { position: 'absolute', left: 86, right: 0, top: 0, bottom: 20 }, muscleGridLine: { position: 'absolute', top: 0, bottom: 0, width: 1, borderLeftColor: 'rgba(244,241,242,0.085)', borderLeftWidth: 1, borderStyle: 'dashed' }, barRow: { flexDirection: 'row', alignItems: 'center', height: 34 }, barLabel: { width: 86, paddingRight: 7, color: muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11, textAlign: 'right' }, barTrack: { flex: 1, height: 18 }, bar: { height: 18, borderTopRightRadius: 4, borderBottomRightRadius: 4 }, muscleAxis: { position: 'relative', height: 20, marginLeft: 86 }, muscleTick: { position: 'absolute', width: 22, marginLeft: -11, textAlign: 'center' },
  calendarMonths: { flexDirection: 'row', gap: 3, marginBottom: 7 }, calendarRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 }, dayLabel: { width: 23, color: muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 9, textAlign: 'right' }, month: { flex: 1, color: muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 10 }, cell: { flex: 1, aspectRatio: 1, borderRadius: 3 }, selectedCell: { borderColor: '#fff', borderWidth: 1 }, scale: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 5, marginTop: 10 }, scaleText: { color: muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 10 }, scaleCell: { width: 11, height: 11, borderRadius: 2 },
})
