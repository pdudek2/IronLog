import WorkoutDraftRecovery from '../src/WorkoutDraftRecovery'
import BottomNavigation, { useBottomNavigation } from '../src/BottomNavigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import Svg, { Circle, Path } from 'react-native-svg'

import { exercises as exerciseCatalog } from '../../data/exercises'
import { EXERCISE_CATEGORY_LABELS } from '../../src/lib/exerciseLabels'
import { pluralize } from '../../src/lib/pluralize'
import { workoutTitle } from '../../src/lib/workoutCopy'
import { readExerciseMetadata, readWorkoutHistory } from '../src/firebase'
import {
  deriveWorkout,
  filterWorkouts,
  formatHistoryDate,
  formatWorkoutDuration,
  groupWorkoutsByMonth,
  type HistoryRange,
  workoutVolumeLabel,
} from '../src/history'
import { useSessionRead } from '../src/useSessionRead'
import { useActiveRuntime, useAuthRuntime } from '../src/runtime'
import HistoryHeader from '../src/HistoryHeader'
import { BottomSheet } from '../src/BottomSheet'
import { covers } from '../src/covers'
import { monthCalendar } from '../../src/shared/monthCalendar'
import { workoutCover } from '../../src/shared/workoutCover'
import { colors } from '../src/theme'
import { Icon } from '../src/icons'

const RANGES: Array<{ key: HistoryRange; label: string }> = [
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: '365', label: 'Year' },
  { key: 'all', label: 'All' },
]


export default function HistoryScreen() {
  const { user } = useAuthRuntime()
  const active = useActiveRuntime()
  const router = useRouter()
  const navigation = useBottomNavigation()
  const uid = user?.uid ?? null
  const historyLoader = useCallback(() => uid ? readWorkoutHistory(uid) : Promise.resolve({ data: { workouts: [], truncated: false }, fromCache: false }), [uid])
  const metadataLoader = useCallback(() => uid ? readExerciseMetadata(uid) : Promise.resolve({ data: [], fromCache: false }), [uid])
  const history = useSessionRead(`history:${uid ?? ''}`, historyLoader, Boolean(uid))
  const metadata = useSessionRead(`history-exercises:${uid ?? ''}`, metadataLoader, Boolean(uid))
  const [range, setRange] = useState<HistoryRange>('90')
  const [rangeAnchorMs, setRangeAnchorMs] = useState(() => Date.now())
  const [search, setSearch] = useState('')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [category, setCategory] = useState<string | null>(null)
  const historyStatus = history.state.status

  useEffect(() => {
    if (historyStatus === 'ready') setRangeAnchorMs(Date.now())
  }, [historyStatus])

  const exerciseMap = useMemo(() => {
    const entries: Array<[string, { category?: string }]> = exerciseCatalog.map((exercise) => [`global:${exercise.id}`, exercise])
    if (metadata.state.status === 'ready') {
      entries.push(...metadata.state.data.map((exercise) => [`user:${exercise.id}`, exercise] as [string, { category?: string }]))
    }
    return new Map(entries)
  }, [metadata.state])
  const workouts = history.state.status === 'ready' ? history.state.data.workouts : []
  const derived = useMemo(() => workouts.map((workout) => deriveWorkout(workout, exerciseMap)), [exerciseMap, workouts])
  const availableCategories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const { categories } of derived) for (const value of categories) counts.set(value, (counts.get(value) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value]) => value)
  }, [derived])
  const filtered = useMemo(() => filterWorkouts(derived, {
    range, rangeAnchorMs, search, category,
  }), [category, derived, range, rangeAnchorMs, search])
  const groups = useMemo(() => groupWorkoutsByMonth(filtered), [filtered])
  const totalVolume = useMemo(() => filtered.reduce((sum, item) => sum + item.totalVolume, 0), [filtered])
  const hasFilters = Boolean(search.trim() || category)
  const showRangeEmpty = workouts.length > 0 && filtered.length === 0 && !hasFilters
  const showFilterEmpty = filtered.length === 0 && hasFilters

  if (!user) return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <StatusBar style="light" />
      <Text accessibilityLiveRegion="polite" style={styles.feedbackText}>Restoring sign-in…</Text>
    </SafeAreaView>
  )

  return (
    <SafeAreaView onFocus={navigation.onFocus} onBlur={navigation.onBlur} edges={['top']} style={styles.screen}>
      <StatusBar style="light" />
      <HistoryHeader />
      <ScrollView onScroll={navigation.onScroll} scrollEventThrottle={16} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <WorkoutDraftRecovery uid={user.uid} />
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>History</Text>
          <View style={styles.subtitleRow}>
          <Text style={[styles.subtitle, styles.subtitleText]}>
            {history.state.status === 'loading'
              ? 'Loading history…'
              : history.state.status === 'error'
              ? 'Could not load workout history.'
              : showFilterEmpty
                ? 'No workouts match these filters.'
                : showRangeEmpty
                  ? 'No workouts in this date range.'
                  : history.state.status === 'ready' && history.state.data.workouts.length === 0 && history.state.fromCache
                    ? 'Could not confirm your saved workouts.'
                    : filtered.length === 0
                      ? 'You have no saved workouts yet.'
                      : `${filtered.length} ${pluralize(filtered.length, 'session', 'sessions')} · ${workoutVolumeLabel(totalVolume, active.state.units)}${history.state.status === 'ready' && history.state.data.truncated ? ' · latest 2,000' : ''}`}
          </Text>
            {workouts.length > 0 && <Pressable accessibilityRole="button" onPress={() => setCalendarOpen(true)} hitSlop={8} style={styles.calendarLink}><Text style={styles.calendarLinkText}>Calendar</Text></Pressable>}
          </View>
        </View>

        {history.state.status === 'loading' && <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.mutedText}>Loading history…</Text></View>}
        {history.state.status === 'error' && (
          <View accessibilityRole="alert" style={styles.errorNotice}>
            <Text style={styles.errorTitle}>Could not load history</Text>
            <Text style={styles.mutedText}>Could not load data. Try again.</Text>
            <Pressable accessibilityRole="button" onPress={history.retry} style={styles.actionButton}><Text style={styles.actionText}>Try again</Text></Pressable>
          </View>
        )}
        {history.state.status === 'ready' && history.state.fromCache && workouts.length > 0 && (
          <View style={styles.cacheNoticeRow}>
            <Text accessibilityLiveRegion="polite" style={styles.cacheNotice}>Showing workout history saved on this device.</Text>
            <Pressable accessibilityRole="button" onPress={history.retry} style={styles.retryTextButton}><Text style={styles.retryText}>Try again</Text></Pressable>
          </View>
        )}
        {history.state.status === 'ready' && history.state.fromCache && workouts.length === 0 && (
          <View accessibilityRole="alert" style={styles.errorNotice}>
            <Text style={styles.errorTitle}>History could not be confirmed</Text>
            <Text style={styles.mutedText}>This device has no saved history to check while offline.</Text>
            <Pressable accessibilityRole="button" onPress={history.retry} style={styles.actionButton}><Text style={styles.actionText}>Try again</Text></Pressable>
          </View>
        )}
        {metadata.state.status === 'error' && (
          <View accessibilityRole="alert" style={styles.metadataNotice}>
            <Text style={styles.mutedText}>Could not load your exercises. History is still available, but some categories may be incomplete.</Text>
            <Pressable accessibilityRole="button" onPress={metadata.retry} style={styles.retryTextButton}><Text style={styles.retryText}>Try again</Text></Pressable>
          </View>
        )}
        {history.state.status === 'ready' && history.state.data.truncated && (
          <Text style={styles.limitNotice}>History is limited to your 2,000 most recent workouts to keep this view responsive.</Text>
        )}

        {history.state.status === 'ready' && !(history.state.fromCache && workouts.length === 0) && (
          <>
            <View accessibilityLabel="History filters" style={styles.filters}>
              <View accessibilityRole="radiogroup" accessibilityLabel="History range" style={styles.rangeRow}>
                {RANGES.map(({ key, label }) => (
                  <Pressable key={key} accessibilityRole="radio" accessibilityState={{ selected: range === key }} onPress={() => { setRange(key); setRangeAnchorMs(Date.now()) }} style={[styles.rangeButton, range === key && styles.rangeSelected]}>
                    <Text style={[styles.rangeLabel, range === key && styles.rangeLabelSelected]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.searchWrap}>
                <Svg accessibilityElementsHidden height={14} width={14} style={styles.searchIcon} viewBox="0 0 24 24"><Circle cx={10.8} cy={10.8} r={6.3} fill="none" stroke={colors.mutedSoft} strokeWidth={2} /><Path d="m16 16 4.3 4.3" fill="none" stroke={colors.mutedSoft} strokeLinecap="round" strokeWidth={2} /></Svg>
                <TextInput accessibilityLabel="Search workout history" onChangeText={setSearch} placeholder="Search workouts or exercises..." placeholderTextColor={colors.mutedSoft} returnKeyType="search" style={styles.searchInput} value={search} />
                {search.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')} style={styles.clearSearch}><Icon name="close" size={18} /></Pressable>}
              </View>
              {availableCategories.length > 0 && (
                <View>
                  <ScrollView accessibilityLabel="Exercise categories" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow} style={styles.categoryScroll}>
                    {availableCategories.map((value) => {
                      const activeCategory = category === value
                      return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: activeCategory }} onPress={() => setCategory(activeCategory ? null : value)} style={[styles.categoryButton, activeCategory && styles.categorySelected]}>
                        <Text style={[styles.categoryText, activeCategory && styles.rangeLabelSelected]}>{EXERCISE_CATEGORY_LABELS[value] ?? value}</Text>
                      </Pressable>
                    })}
                  </ScrollView>
                </View>
              )}
            </View>

            {showRangeEmpty ? (
              <EmptyState title="No workouts in this date range" copy="Earlier sessions are still in your history." action="Show all" onPress={() => setRange('all')} />
            ) : showFilterEmpty ? (
              <EmptyState title="No results" copy="No workouts match your search and selected muscle groups." action="Clear filters" onPress={() => { setSearch(''); setCategory(null) }} />
            ) : filtered.length === 0 ? (
              <View style={styles.emptyState}><Text style={styles.emptyTitle}>Your history is empty</Text><Text style={styles.mutedText}>Your first completed workout will appear here.</Text></View>
            ) : (
              <View style={styles.monthList}>
                {groups.map((group) => (
                  <View key={group.key} style={styles.monthGroup}>
                    <View style={styles.monthHeading}><Text style={styles.monthTitle}>{group.label}</Text><Text style={styles.monthCount}>{group.workouts.length} {pluralize(group.workouts.length, 'session', 'sessions')}</Text></View>
                    <View style={styles.workoutList}>
                      {group.workouts.map(({ workout, totalSets, totalVolume }) => {
                        return <Pressable key={workout.id} accessibilityRole="button" accessibilityLabel={`${workoutTitle(workout)}, ${formatHistoryDate(workout.startedAt)}`} onPress={() => router.push({ pathname: '/workout/[workoutId]', params: { workoutId: workout.id } })} style={styles.workoutRow}>
                          <View style={styles.workoutMain}>
                            <Image source={covers[workoutCover(workout.label)]} style={styles.workoutThumb} />
                            <View style={styles.workoutCopy}>
                              <Text numberOfLines={2} style={styles.workoutTitle}>{workoutTitle(workout)}</Text>
                              <Text style={styles.workoutMetaText}>{formatHistoryDate(workout.startedAt)} · {formatWorkoutDuration(workout.startedAt, workout.finishedAt)} · {workoutVolumeLabel(totalVolume, active.state.units)} · {totalSets} {pluralize(totalSets, 'set', 'sets')}</Text>
                            </View>
                            <Svg accessibilityElementsHidden height={18} width={18} viewBox="0 0 24 24"><Path d="m9 18 6-6-6-6" fill="none" stroke={colors.mutedSoft} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></Svg>
                          </View>
                        </Pressable>
                      })}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    {calendarOpen && <CalendarSheet workouts={workouts} onClose={() => setCalendarOpen(false)}
      onOpenWorkout={(workoutId) => router.push({ pathname: '/workout/[workoutId]', params: { workoutId } })} />}
    <BottomNavigation {...navigation} />
  </SafeAreaView>
  )
}

function CalendarSheet({ workouts, onOpenWorkout, onClose }: { workouts: { id: string; startedAt: number }[]; onOpenWorkout: (workoutId: string) => void; onClose: () => void }) {
  const [offset, setOffset] = useState(0)
  const { label, leadingBlanks, days } = monthCalendar(offset, workouts)
  return <BottomSheet title={label} onClose={onClose}>{(close) => <View>
    <View style={styles.calendarNav}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setOffset(offset - 1)} style={styles.calendarNavButton}><Icon name="chevron-left" size={18} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Next month" accessibilityState={{ disabled: offset === 0 }} disabled={offset === 0} onPress={() => setOffset(offset + 1)} style={[styles.calendarNavButton, offset === 0 && styles.calendarNavDisabled]}><Icon name="chevron-right" size={18} /></Pressable>
    </View>
    <View style={styles.calendarGrid}>
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <View key={index} style={styles.calendarCell}><Text style={styles.calendarWeekday}>{day}</Text></View>)}
      {Array.from({ length: leadingBlanks }, (_, index) => <View key={index} style={styles.calendarCell} />)}
      {days.map(({ day, today, workoutId }) => <View key={day} style={styles.calendarCell}>
        <Pressable accessibilityRole="button" accessibilityLabel={workoutId ? `Open workout from ${label.split(' ')[0]} ${day}` : `${day}`} disabled={!workoutId}
          onPress={() => close(() => { if (workoutId) onOpenWorkout(workoutId) })} style={[styles.calendarDay, workoutId !== null && styles.calendarDayActive, today && styles.calendarDayToday]}>
          <Text style={[styles.calendarDayText, workoutId !== null && styles.calendarDayTextActive]}>{day}</Text>
        </Pressable>
      </View>)}
    </View>
  </View>}</BottomSheet>
}

function EmptyState({ title, copy, action, onPress }: { title: string; copy: string; action: string; onPress: () => void }) {
  return <View style={styles.emptyState}>
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.mutedText}>{copy}</Text>
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.actionButton}><Text style={styles.actionText}>{action}</Text></Pressable>
  </View>
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { flexGrow: 1, paddingBottom: 32, paddingHorizontal: 16, paddingTop: 16 },
  header: { paddingBottom: 12 },
  title: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 28, lineHeight: 31, letterSpacing: -0.67 },
  subtitle: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 21, marginTop: 6 },
  filters: { gap: 10, paddingBottom: 14 },
  subtitleRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' }, subtitleText: { flex: 1 },
  calendarLink: { justifyContent: 'center', minHeight: 44 }, calendarLinkText: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  calendarNav: { flexDirection: 'row', justifyContent: 'flex-end', marginRight: -12, marginTop: -8 }, calendarNavButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, calendarNavDisabled: { opacity: 0.35 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' }, calendarCell: { alignItems: 'center', height: 48, justifyContent: 'center', width: '14.28%' },
  calendarWeekday: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12.5 },
  calendarDay: { alignItems: 'center', borderRadius: 14, height: 44, justifyContent: 'center', width: 44 }, calendarDayActive: { backgroundColor: colors.choiceSelected }, calendarDayToday: { borderColor: colors.text, borderWidth: 1.5 },
  calendarDayText: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] }, calendarDayTextActive: { color: colors.textStrong },
  workoutThumb: { borderRadius: 12, height: 44, width: 44 },
  rangeRow: { backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: 12, flexDirection: 'row', gap: 2, padding: 3 },
  rangeButton: { alignItems: 'center', borderRadius: 9, flex: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 3 },
  rangeSelected: { backgroundColor: colors.choiceSelected },
  rangeLabel: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 13 },
  rangeLabelSelected: { color: colors.text },
  searchWrap: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: 12, flexDirection: 'row', minHeight: 44, paddingHorizontal: 12 },
  searchIcon: { marginRight: 6 },
  searchInput: { color: colors.text, flex: 1, fontFamily: 'InstrumentSans_400Regular', fontSize: 14, minHeight: 44, paddingVertical: 0 },
  clearSearch: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  clearText: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 22, lineHeight: 26 },
  categoryScroll: { marginHorizontal: -16 },
  categoryRow: { alignItems: 'center', gap: 6, paddingHorizontal: 16 },
  categoryButton: { borderColor: colors.line, borderRadius: 10, borderWidth: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  categorySelected: { backgroundColor: colors.choiceSelected, borderColor: 'transparent' },
  categoryText: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 13 },
  monthList: { gap: 24, marginTop: 12, width: '100%' },
  monthGroup: { minWidth: 0 },
  monthHeading: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 4 },
  monthTitle: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14 },
  monthCount: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13 },
  workoutList: { gap: 2 },
  workoutRow: { minHeight: 56 },
  workoutMain: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingVertical: 8 },
  workoutCopy: { flex: 1, minWidth: 0 },
  workoutMetaText: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 18, marginTop: 2, fontVariant: ['tabular-nums'] },
  workoutTitle: { color: colors.text, fontFamily: 'InstrumentSans_500Medium', fontSize: 16, lineHeight: 21 },
  loading: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 20 },
  errorNotice: { backgroundColor: colors.surfaceRaised, gap: 7, marginBottom: 10, padding: 14 },
  errorTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 16 },
  mutedText: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 20 },
  cacheNoticeRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cacheNotice: { color: colors.muted, flex: 1, fontFamily: 'InstrumentSans_500Medium', fontSize: 12 },
  metadataNotice: { borderBottomColor: colors.line, borderTopColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, gap: 4, marginBottom: 8, paddingVertical: 8 },
  retryTextButton: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  retryText: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 12 },
  limitNotice: { backgroundColor: colors.surface, borderRadius: 12, color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 19, marginBottom: 8, padding: 12 },
  emptyState: { alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 40, textAlign: 'center' },
  emptyTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 16, textAlign: 'center' },
  actionButton: { alignItems: 'center', backgroundColor: 'rgba(244, 238, 232, 0.072)', borderRadius: 12, justifyContent: 'center', marginTop: 8, minHeight: 44, paddingHorizontal: 16 },
  actionText: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 12 },
  feedbackText: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', margin: 20 },
})
