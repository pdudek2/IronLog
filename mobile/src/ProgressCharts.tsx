import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg'

import { PROGRESS_HEATMAP_COLORS, PROGRESS_MUSCLE_COLORS, PROGRESS_MUSCLE_LABELS, formatProgressVolume, type HeatmapDay, type MuscleBalancePoint, type StrengthPoint, type WeeklyPoint } from '../../src/shared/progress'
import { kgToDisplayWeight, type WeightUnits } from '../../src/shared/weightUnits'

const muted = '#a09aa0'
const accent = '#f0435a'

function chartPath(values: number[], width: number, height: number, minimum: number, maximum: number): string {
  const span = Math.max(1, maximum - minimum)
  const points = values.map((value, index) => ({ x: values.length === 1 ? width / 2 : index * width / (values.length - 1), y: height - (value - minimum) / span * height }))
  if (!points.length) return ''
  if (points.length === 1) return `M${points[0]!.x},${points[0]!.y}`
  return points.reduce((path, point, index) => {
    if (!index) return `M${point.x},${point.y}`
    const previous = points[index - 1]!
    const control = (previous.x + point.x) / 2
    return `${path} C${control},${previous.y} ${control},${point.y} ${point.x},${point.y}`
  }, '')
}

function Chart({ values, labels, units, width, kind, summary }: { values: number[]; labels: string[]; units: WeightUnits; width: number; kind: 'volume' | 'weight'; summary: string }) {
  const [selected, setSelected] = useState<number | null>(null)
  const plotWidth = Math.max(120, width - 70)
  const plotHeight = 142
  const maximum = Math.max(1, ...values)
  const minimum = kind === 'weight' ? Math.max(0, Math.min(...values) * 0.85) : 0
  const upper = kind === 'weight' ? maximum * 1.08 : maximum * 1.12
  const path = chartPath(values, plotWidth, plotHeight, minimum, upper)
  const yValue = (index: number) => minimum + (upper - minimum) * (1 - index / 2)
  const format = (value: number) => kind === 'volume' ? formatProgressVolume(value, units) : `${kgToDisplayWeight(Math.round(value), units)} ${units}`
  const selectedValue = selected === null ? null : values[selected]
  return <View accessibilityLabel={kind === 'volume' ? 'Weekly workout volume chart' : 'Weight progression chart'}>
    <View style={styles.chartRow}>
      <View style={styles.yLabels}>{[0, 1, 2].map((index) => <Text key={index} numberOfLines={1} adjustsFontSizeToFit style={styles.axis}>{format(yValue(index))}</Text>)}</View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${summary}${selected !== null && selectedValue != null ? ` Selected ${labels[selected]}: ${format(selectedValue)}.` : ''}`} accessibilityHint="Tap to inspect a chart point" style={{ width: plotWidth, height: plotHeight }} onPress={(event) => {
        const fraction = Math.max(0, Math.min(1, event.nativeEvent.locationX / plotWidth))
        setSelected(Math.round(fraction * Math.max(0, values.length - 1)))
      }}>
        <Svg width={plotWidth} height={plotHeight} viewBox={`0 0 ${plotWidth} ${plotHeight}`}>
          <Defs><LinearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={accent} stopOpacity="0.35" /><Stop offset="1" stopColor={accent} stopOpacity="0" /></LinearGradient></Defs>
          {[0, 0.5, 1].map((part) => <Line key={part} x1="0" x2={plotWidth} y1={part * plotHeight} y2={part * plotHeight} stroke="rgba(244,241,242,0.1)" strokeDasharray="3,3" />)}
          {kind === 'volume' && path ? <Path d={`${path} L${plotWidth},${plotHeight} L0,${plotHeight} Z`} fill="url(#chartFill)" /> : null}
          {path ? <Path d={path} fill="none" stroke={accent} strokeWidth={2.4} /> : null}
          {kind === 'weight' && values.map((value, index) => {
            const x = values.length === 1 ? plotWidth / 2 : index * plotWidth / (values.length - 1)
            const y = plotHeight - (value - minimum) / Math.max(1, upper - minimum) * plotHeight
            return <Circle key={index} cx={x} cy={y} r={3} fill={accent} />
          })}
          {selected !== null && selectedValue != null && <Circle cx={values.length === 1 ? plotWidth / 2 : selected * plotWidth / (values.length - 1)} cy={plotHeight - (selectedValue - minimum) / Math.max(1, upper - minimum) * plotHeight} r={5} fill={accent} stroke="#fff" strokeWidth={1} />}
        </Svg>
      </Pressable>
    </View>
    <View style={[styles.xLabels, { marginLeft: 58, width: plotWidth }]}>{labels.map((label, index) => <Text key={`${label}:${index}`} numberOfLines={1} style={styles.axis}>{index === 0 || index === labels.length - 1 || (labels.length <= 13 ? index % (labels.length > 6 ? 2 : 1) === 0 : index % 8 === 0) ? label : ''}</Text>)}</View>
    {selected !== null && selectedValue != null && <Text accessibilityLiveRegion="polite" style={styles.inspection}>{labels[selected]} · {format(selectedValue)}</Text>}
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
  const [selected, setSelected] = useState<string | null>(null)
  return <View accessibilityLabel="Muscle group balance" style={styles.bars}>{points.map((point) => <Pressable key={point.muscle} accessibilityRole="button" accessibilityLabel={`${PROGRESS_MUSCLE_LABELS[point.muscle] ?? point.muscle}: ${point.count} entries`} onPress={() => setSelected(point.muscle)} style={styles.barRow}>
    <Text numberOfLines={1} style={styles.barLabel}>{PROGRESS_MUSCLE_LABELS[point.muscle] ?? point.muscle}</Text>
    <View style={styles.barTrack}><View style={[styles.bar, { width: `${point.count / maximum * 100}%`, backgroundColor: PROGRESS_MUSCLE_COLORS[point.muscle] ?? accent }]} /></View>
    <Text style={styles.barCount}>{point.count}</Text>
  </Pressable>)}{selected && <Text accessibilityLiveRegion="polite" style={styles.inspection}>{PROGRESS_MUSCLE_LABELS[selected] ?? selected}: {points.find((point) => point.muscle === selected)?.count ?? 0} entries</Text>}</View>
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
    <View style={styles.scale}><Text style={styles.scaleText}>Less</Text>{PROGRESS_HEATMAP_COLORS.map((color) => <View key={color} style={[styles.scaleCell, { backgroundColor: color }]} />)}<Text style={styles.scaleText}>More</Text></View>
  </View>
}

const styles = StyleSheet.create({
  chartRow: { flexDirection: 'row', alignItems: 'stretch' }, yLabels: { width: 58, justifyContent: 'space-between', paddingRight: 6 }, axis: { color: muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 10 },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 }, inspection: { color: '#f4f1f2', fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, marginTop: 10 },
  bars: { gap: 3 }, barRow: { flexDirection: 'row', alignItems: 'center', minHeight: 30, gap: 8 }, barLabel: { width: 74, color: muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 11 }, barTrack: { flex: 1, height: 17, backgroundColor: 'rgba(255,255,255,0.025)' }, bar: { height: 17, borderTopRightRadius: 4, borderBottomRightRadius: 4 }, barCount: { width: 25, color: muted, fontFamily: 'SplineSansMono_600SemiBold', fontSize: 11, textAlign: 'right' },
  calendarMonths: { flexDirection: 'row', gap: 3, marginBottom: 7 }, calendarRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 }, dayLabel: { width: 23, color: muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 9, textAlign: 'right' }, month: { flex: 1, color: muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 10 }, cell: { flex: 1, aspectRatio: 1, borderRadius: 3 }, selectedCell: { borderColor: '#fff', borderWidth: 1 }, scale: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 5, marginTop: 10 }, scaleText: { color: muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 10 }, scaleCell: { width: 11, height: 11, borderRadius: 2 },
})
