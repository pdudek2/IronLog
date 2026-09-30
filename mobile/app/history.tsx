import BottomNavigation, { useBottomNavigation } from '../src/BottomNavigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import Svg, { Circle, Path } from 'react-native-svg'

import { exercises as exerciseCatalog } from '../../data/exercises'
import { EXERCISE_CATEGORY_COLORS, EXERCISE_CATEGORY_LABELS } from '../../src/lib/exerciseLabels'
import { pluralize } from '../../src/lib/pluralize'
import { workoutTitle } from '../../src/lib/workoutCopy'
import { readExerciseMetadata, readWorkoutHistory } from '../src/firebase'
import {
  deriveWorkout,
  filterWorkouts,
  formatExercisePreview,
  formatHistoryDate,
  formatWorkoutDuration,
  groupWorkoutsByMonth,
  type HistoryRange,
  workoutVolumeLabel,
} from '../src/history'
import { useSessionRead } from '../src/useSessionRead'
import { useActiveRuntime, useAuthRuntime } from '../src/runtime'
import ActiveWorkoutReturnBar from '../src/ActiveWorkoutReturnBar'
import HistoryHeader from '../src/HistoryHeader'
import grainTexture from '../assets/grain.png'

const RANGES: Array<{ key: HistoryRange; label: string }> = [
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: '365', label: 'Year' },
  { key: 'all', label: 'All' },
]

const colors = {
  background: '#111012', surface: '#1a191c', raised: '#211f23', line: 'rgba(244, 241, 242, 0.1)',
  text: '#f4f1f2', strong: '#ffffff', muted: '#a09aa0', mutedSoft: '#8f8990', accent: '#f0435a', accentText: '#ff7182', warning: '#f0a75a',
}

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
      <ActiveWorkoutReturnBar />
      <ScrollView onScroll={navigation.onScroll} scrollEventThrottle={16} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View pointerEvents="none" style={styles.grain}><Image accessibilityElementsHidden resizeMode="repeat" source={grainTexture} style={styles.grainImage} /></View>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>History</Text>
          <Text style={styles.subtitle}>
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
                {search.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')} style={styles.clearSearch}><Text style={styles.clearText}>×</Text></Pressable>}
              </View>
              {availableCategories.length > 0 && (
                <View>
                  <ScrollView accessibilityLabel="Exercise categories" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow} style={styles.categoryScroll}>
                    {availableCategories.map((value) => {
                      const activeCategory = category === value
                      const accent = EXERCISE_CATEGORY_COLORS[value] ?? colors.accent
                      return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: activeCategory }} onPress={() => setCategory(activeCategory ? null : value)} style={[styles.categoryButton, { backgroundColor: activeCategory ? `${accent}22` : 'rgba(255,255,255,0.035)' }]}>
                        <Text style={[styles.categoryText, { color: activeCategory ? accent : colors.muted }]}>{EXERCISE_CATEGORY_LABELS[value] ?? value}</Text>
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
                      {group.workouts.map(({ workout, totalSets, totalVolume, exerciseNames }) => {
                        return <Pressable key={workout.id} accessibilityRole="button" accessibilityLabel={`${workoutTitle(workout)}, ${formatHistoryDate(workout.startedAt)}`} onPress={() => router.push({ pathname: '/workout/[workoutId]', params: { workoutId: workout.id } })} style={styles.workoutRow}>
                          <View style={styles.workoutMain}>
                            <View style={styles.workoutCopy}>
                              <Text style={styles.workoutMetaText}>{formatHistoryDate(workout.startedAt)} · {formatWorkoutDuration(workout.startedAt, workout.finishedAt)} · {workoutVolumeLabel(totalVolume, active.state.units)} · {totalSets} {pluralize(totalSets, 'set', 'sets')}</Text>
                              <Text numberOfLines={2} style={styles.workoutTitle}>{workoutTitle(workout)}</Text>
                              {workoutTitle(workout) !== exerciseNames.map((name) => name.trim()).join(' + ') && <Text numberOfLines={2} style={styles.exercisePreview}>{formatExercisePreview(exerciseNames)}</Text>}
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
    <BottomNavigation {...navigation} />
  </SafeAreaView>
  )
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
  content: { flexGrow: 1, paddingBottom: 32, paddingHorizontal: 16, paddingTop: 32, experimental_backgroundImage: 'linear-gradient(115deg, rgba(240, 67, 90, 0.055) 0%, transparent 26%, transparent 68%, rgba(143, 184, 160, 0.065) 100%), linear-gradient(180deg, #0b0a0c 0%, #111012 42%, #0d0c0e 100%)' },
  grain: { height: '100%', opacity: 0.024, position: 'absolute', width: '100%' },
  grainImage: { height: '100%', width: '100%' },
  header: { borderBottomColor: 'rgba(244, 241, 242, 0.09)', borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 14, paddingTop: 13 },
  title: { color: colors.strong, fontFamily: 'ArchivoHeading', fontSize: 38.4, lineHeight: 38 },
  subtitle: { color: 'rgba(244, 241, 242, 0.7)', fontFamily: 'InstrumentSans_400Regular', fontSize: 14.4, lineHeight: 21.6, marginTop: 10 },
  filters: { gap: 9, paddingBottom: 14, paddingTop: 12 },
  rangeRow: { backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: 12, flexDirection: 'row', gap: 2, padding: 3 },
  rangeButton: { alignItems: 'center', borderRadius: 9, flex: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 3 },
  rangeSelected: { backgroundColor: 'rgba(240, 67, 90, 0.16)' },
  rangeLabel: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12 },
  rangeLabelSelected: { color: colors.accentText },
  searchWrap: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: 12, flexDirection: 'row', minHeight: 44, paddingHorizontal: 12 },
  searchIcon: { marginRight: 6 },
  searchInput: { color: colors.text, flex: 1, fontFamily: 'InstrumentSans_500Medium', fontSize: 13, minHeight: 44, paddingVertical: 0 },
  clearSearch: { alignItems: 'center', height: 32, justifyContent: 'center', width: 32 },
  clearText: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 22, lineHeight: 26 },
  categoryScroll: { marginHorizontal: -16 },
  categoryRow: { alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  categoryButton: { borderRadius: 22, minHeight: 44, justifyContent: 'center', paddingHorizontal: 12.5 },
  categoryText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12 },
  monthList: { gap: 24, marginTop: 12, width: '100%' },
  monthGroup: { minWidth: 0 },
  monthHeading: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 9 },
  monthTitle: { color: colors.strong, fontFamily: 'ArchivoHeading', fontSize: 18 },
  monthCount: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 12 },
  workoutList: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  workoutRow: { backgroundColor: 'transparent', borderBottomColor: 'rgba(244, 241, 242, 0.1)', borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 76 },
  workoutMain: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 14 },
  workoutCopy: { flex: 1, minWidth: 0 },
  workoutMetaText: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 12, lineHeight: 16 },
  workoutTitle: { color: colors.strong, fontFamily: 'InstrumentSans_700Bold', fontSize: 16.3, lineHeight: 19.3, marginTop: 4 },
  exercisePreview: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12.5, lineHeight: 17.5, marginTop: 4 },
  loading: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 20 },
  errorNotice: { backgroundColor: colors.raised, gap: 7, marginBottom: 10, padding: 14 },
  errorTitle: { color: colors.strong, fontFamily: 'InstrumentSans_700Bold', fontSize: 16 },
  mutedText: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 20 },
  cacheNoticeRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cacheNotice: { color: colors.muted, flex: 1, fontFamily: 'InstrumentSans_500Medium', fontSize: 12 },
  metadataNotice: { borderBottomColor: colors.line, borderTopColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, gap: 4, marginBottom: 8, paddingVertical: 8 },
  retryTextButton: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  retryText: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 12 },
  limitNotice: { backgroundColor: colors.surface, borderRadius: 12, color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, lineHeight: 19, marginBottom: 8, padding: 12 },
  emptyState: { alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 40, textAlign: 'center' },
  emptyTitle: { color: colors.strong, fontFamily: 'InstrumentSans_700Bold', fontSize: 16, textAlign: 'center' },
  actionButton: { alignItems: 'center', backgroundColor: 'rgba(240, 67, 90, 0.12)', borderRadius: 12, justifyContent: 'center', marginTop: 8, minHeight: 44, paddingHorizontal: 16 },
  actionText: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 12 },
  feedbackText: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', margin: 20 },
})
