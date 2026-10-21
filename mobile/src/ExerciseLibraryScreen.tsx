import { useCallback, useState, type ReactNode } from 'react'
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Svg, { Path } from 'react-native-svg'
import { exercises, type Exercise } from '../../data/exercises'
import { EXERCISE_CATEGORY_COLORS, EXERCISE_CATEGORY_LABELS, getEquipmentLabel, getMuscleLabel } from '../../src/lib/exerciseLabels'
import { pluralize } from '../../src/lib/pluralize'
import { formatCompactVolume, kgToDisplayWeight } from '../../src/shared/weightUnits'
import grainTexture from '../assets/grain.png'
import { categories, equipmentOptions, exerciseRowMuscles, exerciseTaxonomy, filterExercises, type ExerciseSession } from './exerciseCatalogue'
import { readExerciseMetadata } from './firebase'
import { readExerciseDetail } from './nativeExercises'
import { useAuthRuntime } from './runtime'
import { readStateForKey, startRead, type ReadResult, type ReadState } from './scopedRead'
import type { ExerciseSource } from './session'
import ActiveWorkoutReturnBar from './ActiveWorkoutReturnBar'
import BottomNavigation, { useBottomNavigation } from './BottomNavigation'
import HistoryHeader from './HistoryHeader'
import ExerciseForm from './ExerciseForm'
import { colors, pageBackground } from './theme'
import { Icon as LineIcon } from './icons'

function useFocusedRead<T>(key: string, load: () => Promise<ReadResult<T>>, enabled = true) {
  const [stored, setStored] = useState<{ key: string; state: ReadState<T> } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useFocusEffect(useCallback(() => {
    if (enabled) return startRead(load, state => setStored({ key, state }))
  }, [key, load, attempt, enabled]))
  return { state: readStateForKey(key, stored), retry: () => setAttempt(value => value + 1) }
}

function Frame({ children, navigation }: { children: ReactNode; navigation: ReturnType<typeof useBottomNavigation> }) {
  return <SafeAreaView onFocus={navigation.onFocus} onBlur={navigation.onBlur} edges={['top']} style={styles.screen}>
    <StatusBar style="light" /><HistoryHeader /><ActiveWorkoutReturnBar />
    <View style={styles.body}><View pointerEvents="none" style={styles.grain}><Image source={grainTexture} resizeMode="repeat" accessibilityElementsHidden style={styles.grainImage} /></View>{children}</View>
    <BottomNavigation {...navigation} />
  </SafeAreaView>
}
function Icon({ kind }: { kind: 'search' | 'edit' | 'right' | 'filters' }) {
  return <Svg accessibilityElementsHidden width={16} height={16} viewBox="0 0 24 24"><Path d={kind === 'search' ? 'm21 21-4.34-4.34M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z' : kind === 'edit' ? 'M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4' : kind === 'filters' ? 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6' : 'm9 18 6-6-6-6'} stroke={colors.muted} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
}

export function ExerciseLibraryScreen() {
  const { user } = useAuthRuntime()
  return user ? <Library key={user.uid} uid={user.uid} /> : <SafeAreaView style={styles.screen}><Text style={styles.copy}>Restoring sign-in…</Text></SafeAreaView>
}
type LibraryItem = { kind: 'section'; title: string; count: number | string; key: string } | { kind: 'status'; key: string } | { kind: 'exercise'; exercise: Exercise; source: ExerciseSource; key: string }
function Library({ uid }: { uid: string }) {
  const router = useRouter()
  const navigation = useBottomNavigation()
  const load = useCallback(() => readExerciseMetadata(uid), [uid])
  const catalog = useFocusedRead(uid, load)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [equipment, setEquipment] = useState('all')
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState<{ exercise: Exercise | null } | null>(null)
  const custom = catalog.state.status === 'ready' ? catalog.state.data as Exercise[] : []
  const own = filterExercises(custom, search, category, equipment)
  const global = filterExercises(exercises, search, category, equipment)
  const activeFilters = search.trim() || category !== 'all' || equipment !== 'all'
  const clear = () => { setSearch(''); setCategory('all'); setEquipment('all') }
  const filterCount = Number(category !== 'all') + Number(equipment !== 'all')
  const items: LibraryItem[] = [
    { kind: 'section', key: 'custom-head', title: 'My exercises', count: catalog.state.status === 'ready' && !catalog.state.fromCache ? own.length : '—' },
    { kind: 'status', key: 'custom-status' },
    ...own.map(exercise => ({ kind: 'exercise' as const, key: `user:${exercise.id}`, exercise, source: 'user' as const })),
    { kind: 'section', key: 'shared-head', title: 'Shared library', count: global.length },
    ...global.map(exercise => ({ kind: 'exercise' as const, key: `global:${exercise.id}`, exercise, source: 'global' as const })),
  ]
  return <Frame navigation={navigation}>
    <FlatList data={items} keyExtractor={item => item.key} onScroll={navigation.onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={styles.libraryHeader}><Text accessibilityRole="header" style={styles.title}>Exercises</Text><View style={styles.commands}>
        <View style={styles.search}><View style={styles.searchRow}><Icon kind="search" /><TextInput accessibilityLabel="Search exercises" placeholder="Search exercises..." placeholderTextColor={colors.mutedSoft} value={search} onChangeText={setSearch} style={styles.searchInput} /></View>{activeFilters && <Pressable accessibilityRole="button" accessibilityLabel="Clear filters" hitSlop={6} onPress={clear} style={styles.clear}><Text style={styles.action}>Clear</Text></Pressable>}</View>
        <View style={styles.commandRow}><Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.filterToggle}><Icon kind="filters" /><Text style={styles.commandText}>Filters</Text>{filterCount > 0 && <Text style={styles.filterCount}>{filterCount}</Text>}<View style={styles.chevron}><Icon kind="right" /></View></Pressable><Pressable accessibilityRole="button" accessibilityState={{ disabled: catalog.state.status !== 'ready' || catalog.state.fromCache }} disabled={catalog.state.status !== 'ready' || catalog.state.fromCache} onPress={() => setForm({ exercise: null })} style={[styles.add, catalog.state.status !== 'ready' && { opacity: 0.5 }]}><LineIcon name="plus" size={14} color={colors.textStrong} /><Text style={styles.commandText}>Add custom</Text></Pressable></View>
        {expanded && <View style={styles.filterBoard}><Filter label="Exercise category" options={['all', ...categories]} value={category} getLabel={value => value === 'all' ? 'All' : EXERCISE_CATEGORY_LABELS[value]!} onChange={setCategory} /><Filter label="Equipment" options={['all', ...equipmentOptions]} value={equipment} getLabel={value => value === 'all' ? 'All' : getEquipmentLabel(value)} onChange={setEquipment} /></View>}
      </View></View>}
      ListFooterComponent={global.length === 0 && own.length === 0 && catalog.state.status === 'ready' && !catalog.state.fromCache ? <View style={styles.empty}><Text style={styles.emptyTitle}>No results</Text><Text style={styles.copy}>Change filters or enter another name.</Text></View> : null}
      renderItem={({ item }) => item.kind === 'section' ? <View style={[styles.section, item.key === 'shared-head' && styles.shared]}><Text accessibilityRole="header" style={styles.sectionTitle}>{item.title}</Text><Text style={styles.count}>{item.count}</Text></View>
        : item.kind === 'status' ? catalog.state.status === 'loading' ? <View style={styles.empty}><Text style={styles.copy}>Loading...</Text></View>
          : catalog.state.status === 'error' ? <Feedback title="Could not load your exercises" copy="The shared library is still available. Check your connection and try again." retry={catalog.retry} />
            : catalog.state.fromCache ? <Feedback copy="Showing exercises saved on this device. Reconnect to confirm your library." retry={catalog.retry} />
              : own.length === 0 && custom.length > 0 ? <View style={styles.empty}><Text style={styles.copy}>None of your exercises match these filters.</Text></View> : null
        : <View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel={`Open exercise ${item.exercise.name}`} onPress={() => router.push(`/exercises/${item.source}/${item.exercise.id}`)} style={styles.rowMain}><Text numberOfLines={1} style={styles.rowName}>{item.exercise.name}</Text><Text numberOfLines={1} style={styles.rowMeta}>{exerciseTaxonomy(item.exercise)}</Text>{exerciseRowMuscles(item.exercise) && <Text style={styles.rowMuscles}>{exerciseRowMuscles(item.exercise)}</Text>}</Pressable>{item.source === 'user' ? <Pressable accessibilityRole="button" accessibilityLabel={`Edit exercise ${item.exercise.name}`} onPress={() => setForm({ exercise: item.exercise })} style={styles.rowAction}><Icon kind="edit" /></Pressable> : <View style={styles.rowAction}><Icon kind="right" /></View>}</View>}
    />
    {form && <ExerciseForm uid={uid} exercise={form.exercise} onClose={() => setForm(null)} onSaved={() => { setForm(null); catalog.retry() }} />}
  </Frame>
}
function Filter({ label, options, value, getLabel, onChange }: { label: string; options: string[]; value: string; getLabel: (value: string) => string; onChange: (value: string) => void }) {
  return <View style={styles.filterGroup}><Text style={styles.filterLabel}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.filterChips}>{options.map(option => <Pressable key={option} accessibilityRole="button" accessibilityLabel={`${label}: ${getLabel(option)}`} accessibilityState={{ selected: value === option }} onPress={() => onChange(option)} style={[styles.filterChip, value === option && styles.filterActive]}><Text style={[styles.filterChipText, value === option && { color: colors.accentText }]}>{getLabel(option)}</Text></Pressable>)}</ScrollView></View>
}
function Feedback({ title, copy, retry }: { title?: string; copy: string; retry: () => void }) {
  return <View accessibilityRole="alert" style={styles.empty}>{title && <Text style={styles.emptyTitle}>{title}</Text>}<Text style={styles.copy}>{copy}</Text><Pressable accessibilityRole="button" onPress={retry} style={[styles.retry, styles.feedbackRetry]}><Text style={[styles.commandText, { fontSize: 13.12 }]}>Try again</Text></Pressable></View>
}

export function ExerciseDetailScreen({ source, id }: { source: string; id: string }) {
  const { user } = useAuthRuntime()
  return user ? <Detail key={`${user.uid}:${source}:${id}`} uid={user.uid} source={source} id={id} /> : <SafeAreaView style={styles.screen}><Text style={styles.copy}>Restoring sign-in…</Text></SafeAreaView>
}
function Detail({ uid, source, id }: { uid: string; source: string; id: string }) {
  const router = useRouter()
  const navigation = useBottomNavigation()
  const valid = (source === 'global' || source === 'user') && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(id)
  const global = source === 'global' ? exercises.find(exercise => exercise.id === id) : null
  const loadMetadata = useCallback(() => readExerciseMetadata(uid), [uid])
  const metadata = useFocusedRead(uid, loadMetadata, valid && source === 'user')
  const loadHistory = useCallback(() => readExerciseDetail(uid, id, source as ExerciseSource), [uid, id, source])
  const history = useFocusedRead(`${uid}:${source}:${id}`, loadHistory, valid && (source === 'user' || !!global))
  const exercise = source === 'global' ? global : metadata.state.status === 'ready' ? metadata.state.data.find(exercise => exercise.id === id) : null
  const data = history.state.status === 'ready' ? history.state.data : null
  const sessions = data?.sessions ?? []
  const record = data?.record
  const missing = source === 'global' ? !global : metadata.state.status === 'ready' && !metadata.state.fromCache && !exercise
  const absent = !valid || (missing && !record && sessions.length === 0 && (source === 'global' || history.state.status === 'ready'))
  const loading = valid && !absent && (history.state.status === 'loading' || (source === 'user' && metadata.state.status === 'loading'))
  const accent = EXERCISE_CATEGORY_COLORS[exercise?.category ?? ''] ?? colors.accent
  const units = data?.units ?? 'kg'
  const taxonomy = [exercise?.category ? EXERCISE_CATEGORY_LABELS[exercise.category] : null, exercise?.equipment ? getEquipmentLabel(exercise.equipment) : null, source === 'user' ? 'Custom' : null].filter(Boolean)
  const muscles = [...new Set((exercise?.muscles ?? []).map(getMuscleLabel).filter(label => label !== EXERCISE_CATEGORY_LABELS[exercise?.category ?? '']))]
  const allTime = Math.max(record?.totalSessions ?? 0, sessions.length)
  const latest = sessions[0]?.totalVolume ?? 0
  const maxVolume = Math.max(...sessions.map(session => session.totalVolume), 1)
  return <Frame navigation={navigation}><ScrollView onScroll={navigation.onScroll} scrollEventThrottle={16} contentContainerStyle={styles.detailContent}>
    {absent ? <View style={styles.notFound}><Text style={styles.copy}>Exercise library</Text><Text accessibilityRole="header" style={styles.notFoundTitle}>Exercise not found</Text><Text style={styles.copy}>This link is outdated or the exercise has been deleted.</Text><Pressable accessibilityRole="button" onPress={() => router.dismissTo('/exercises')} style={styles.retry}><Text style={styles.commandText}>Back to library</Text></Pressable></View>
      : loading ? <View style={styles.empty}><Text style={styles.copy}>Loading exercise...</Text></View>
        : history.state.status === 'error' ? <Feedback title="Could not load exercise" copy="History data did not load. Check your connection and try again." retry={history.retry} />
          : <><View style={styles.hero}>
            {source === 'user' && (metadata.state.status === 'error' || (metadata.state.status === 'ready' && metadata.state.fromCache)) && <Feedback copy="Could not load this exercise name and category. History and records are still available." retry={metadata.retry} />}
            {taxonomy.length > 0 && <View style={styles.classification}><Text style={styles.taxonomy}><Text style={{ color: accent }}>{taxonomy[0]}</Text>{taxonomy.slice(1).map(value => ` · ${value}`).join('')}</Text>{muscles.length > 0 && <Text style={styles.muscles}>Muscles · {muscles.join(' · ')}</Text>}</View>}
            <Text accessibilityRole="header" textBreakStrategy="simple" style={styles.detailTitle}>{exercise?.name || record?.exerciseName || sessions[0]?.exerciseName || id}</Text>
            <Text style={styles.subtitle}>{allTime > 0 ? `${allTime} ${pluralize(allTime, 'session', 'sessions')} total${sessions.length > 0 && allTime > sessions.length ? ` · ${sessions.length} most recent below` : ''}` : 'No history yet. Add this exercise to a session to start tracking progress.'}</Text>
            {record && <View style={styles.records}><View style={styles.record}><Text style={styles.recordLabel}>Max weight</Text><Text style={styles.recordValue}>{kgToDisplayWeight(record.maxWeight, units)} <Text style={styles.unit}>{units}</Text></Text></View><View style={styles.record}><Text style={styles.recordLabel}>Reps at record weight</Text><Text style={styles.recordValue}>{record.maxReps}</Text></View></View>}
          </View>
          {sessions.length > 0 && <><View style={[styles.panel, styles.firstPanel]}><Text accessibilityRole="header" style={styles.panelTitle}>Volume per session</Text><View style={styles.volumeSummary}><View><Text style={styles.volumeLabel}>{latest === maxVolume ? 'Latest · maximum' : 'Latest'}</Text><Text style={styles.volumeValue}>{formatCompactVolume(latest, units)}</Text></View>{latest !== maxVolume && <View><Text style={styles.volumeLabel}>Maximum</Text><Text style={styles.volumeValue}>{formatCompactVolume(maxVolume, units)}</Text></View>}</View><ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.chart}>{[...sessions].reverse().map(session => <View key={session.id} accessible accessibilityLabel={`${date(session.startedAt)}: ${formatCompactVolume(session.totalVolume, units)}`} style={styles.column}><View style={styles.track}><View style={[styles.bar, { height: Math.max(session.totalVolume / maxVolume * 108, 4), backgroundColor: accent }]} /></View><Text style={styles.chartDate}>{new Date(session.startedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'numeric' })}</Text></View>)}</ScrollView></View><View style={styles.panel}><Text accessibilityRole="header" style={styles.panelTitle}>Recent workouts</Text>{sessions.map(session => <SessionRow key={session.id} session={session} units={units} accent={accent} />)}</View></>}
        </>}
  </ScrollView></Frame>
}
const date = (timestamp: number) => new Date(timestamp).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
function SessionRow({ session, units, accent }: { session: ExerciseSession; units: 'kg' | 'lbs'; accent: string }) {
  const [open, setOpen] = useState(false)
  return <View style={styles.session}><Pressable accessibilityRole="button" accessibilityLabel={`${date(session.startedAt)}, Details`} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.sessionSummary}><View style={styles.sessionHead}><View style={styles.sessionCopy}><Text style={styles.sessionDate}>{date(session.startedAt)}</Text>{session.label && <Text style={styles.sessionLabel}>{session.label}</Text>}</View><View style={styles.sessionVolume}><Text style={styles.sessionDate}>{formatCompactVolume(session.totalVolume, units)}</Text><View style={styles.detailsRow}><Text style={styles.details}>Details</Text><LineIcon name={open ? 'chevron-up' : 'chevron-down'} size={13} /></View></View></View><Text style={styles.metrics}>{session.totalSets} {pluralize(session.totalSets, 'set', 'sets')} · {session.totalReps} reps · top <Text style={{ color: accent }}>{session.bestSetWeight ? `${kgToDisplayWeight(session.bestSetWeight, units)} ${units}` : '—'}</Text></Text></Pressable>{open && session.sets.length > 0 && <View style={styles.sets}><Text style={styles.volumeLabel}>Sets</Text><Text style={styles.setValues}>{session.sets.map(set => `${kgToDisplayWeight(set.weight, units)}×${set.reps}`).join(' · ')}</Text></View>}</View>
}

const styles = StyleSheet.create({
  detailsRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  feedbackRetry: { alignSelf: 'stretch', alignItems: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: 'rgba(255,255,255,0.035)' },
  screen: { flex: 1, backgroundColor: colors.background }, body: { flex: 1, experimental_backgroundImage: pageBackground }, grain: { ...StyleSheet.absoluteFill, opacity: 0.024 }, grainImage: { width: '100%', height: '100%' }, content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 96 }, libraryHeader: { paddingTop: 16, paddingBottom: 32, gap: 16 }, title: { fontFamily: 'ArchivoHeading', color: colors.textStrong, fontSize: 38.4, lineHeight: 37.632, marginTop: 6.08 }, commands: { gap: 8.8 }, search: { gap: 10.4, backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10.4, minHeight: 44 }, searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10.4 }, searchInput: { flex: 1, minWidth: 0, padding: 0, minHeight: 44, color: colors.textStrong, fontFamily: 'InstrumentSans_400Regular', fontSize: 14.72 }, clear: { minHeight: 33.1, minWidth: 70.6, alignSelf: 'flex-start', marginLeft: 31.2, alignItems: 'center', justifyContent: 'center' }, action: { fontFamily: 'InstrumentSans_600SemiBold', color: colors.muted, fontSize: 11.84 }, commandRow: { flexDirection: 'row', gap: 8.8 }, filterToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 12 }, commandText: { fontFamily: 'InstrumentSans_700Bold', color: colors.textStrong, fontSize: 12.8 }, chevron: { marginLeft: 'auto' }, filterCount: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 12 }, add: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.surface, borderRadius: 8 }, filterBoard: { gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(244,241,242,0.18)', paddingBottom: 0 }, filterGroup: { gap: 7.2 }, filterLabel: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 11 }, filterChips: { flexDirection: 'row', gap: 6.72, paddingBottom: 2.4 }, filterChip: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5.6, borderBottomWidth: 2, borderBottomColor: 'transparent' }, filterActive: { borderBottomColor: colors.accent }, filterChipText: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 11.52 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(244,241,242,0.18)', borderBottomWidth: 1, borderBottomColor: 'rgba(244,241,242,0.09)', paddingVertical: 15.2 }, shared: { marginTop: 16 }, sectionTitle: { fontFamily: 'ArchivoHeading', fontSize: 20, lineHeight: 21, color: colors.textStrong }, count: { fontFamily: 'InstrumentSans_700Bold', fontSize: 11.84, lineHeight: 17.76, includeFontPadding: false, color: colors.muted, paddingVertical: 5.44 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10.4, paddingVertical: 12.8, borderBottomWidth: 1, borderBottomColor: 'rgba(244,241,242,0.075)' }, rowMain: { flex: 1, gap: 3.84, minHeight: 44, justifyContent: 'center' }, rowName: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 15.36, lineHeight: 18.432 }, rowMeta: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 11, lineHeight: 16.32 }, rowMuscles: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 11, lineHeight: 15.84, marginTop: 1.6 }, rowAction: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, empty: { padding: 17.6, gap: 8.8 }, copy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13.76, lineHeight: 20.64 }, emptyTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 15.2 }, retry: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.surface, marginTop: 4 },
  detailContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }, hero: { paddingTop: 16, paddingBottom: 16, gap: 20, borderBottomWidth: 1, borderBottomColor: colors.line }, classification: { gap: 5.6 }, taxonomy: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, lineHeight: 18 }, muscles: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 11, lineHeight: 15.84 }, detailTitle: { includeFontPadding: false, paddingBottom: 4.24, color: colors.textStrong, fontFamily: 'ArchivoHeading', fontSize: 42.3, lineHeight: 41.552, marginTop: 6.08 }, subtitle: { color: 'rgba(244,241,242,0.7)', fontFamily: 'InstrumentSans_400Regular', fontSize: 14.4, lineHeight: 21.6, marginTop: 10.4 }, records: { flexDirection: 'row', gap: 24, marginTop: 5.6, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(244,241,242,0.18)' }, record: { flex: 1, minWidth: 0 }, recordLabel: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 11.52 }, recordValue: { includeFontPadding: false, color: colors.textStrong, fontFamily: 'ArchivoHeading', fontSize: 20, lineHeight: 20, marginTop: 4.8 }, unit: { color: colors.muted, fontSize: 16 }, panel: { borderTopWidth: 1, borderTopColor: 'rgba(244,241,242,0.18)', paddingVertical: 21.6, marginTop: 20 }, firstPanel: { marginTop: 0 }, panelTitle: { color: colors.textStrong, fontFamily: 'ArchivoHeading', fontSize: 21.6, lineHeight: 24, marginBottom: 16 }, volumeSummary: { flexDirection: 'row', gap: 24, marginBottom: 16 }, volumeLabel: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12 }, volumeValue: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 16, marginTop: 3.2 }, chart: { minHeight: 144, gap: 7.2, alignItems: 'flex-end', paddingBottom: 8 }, column: { width: 32, gap: 6.4 }, track: { height: 108, backgroundColor: 'rgba(255,255,255,0.035)', justifyContent: 'flex-end', borderRadius: 4 }, bar: { width: 32, opacity: 0.7, borderTopLeftRadius: 4, borderTopRightRadius: 4 }, chartDate: { color: colors.mutedSoft, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, textAlign: 'center' },
  session: { borderBottomColor: colors.line, borderBottomWidth: 1 }, sessionSummary: { paddingVertical: 16, gap: 8.8 }, sessionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }, sessionCopy: { flex: 1, minWidth: 0 }, sessionDate: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, lineHeight: 20 }, sessionLabel: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, marginTop: 2 }, sessionVolume: { flexDirection: 'row', alignItems: 'center', gap: 8.8 }, details: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 11 }, metrics: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18 }, sets: { borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.035)', padding: 12, gap: 8, marginBottom: 16 }, setValues: { color: colors.text, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18 }, notFound: { padding: 24, gap: 12, alignItems: 'center' }, notFoundTitle: { color: colors.textStrong, fontFamily: 'ArchivoHeading', fontSize: 28 },
})
