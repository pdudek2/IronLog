import { useEffect, useState } from 'react'
import { FlatList, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'

import { exercises as exerciseDb, searchExercises, type Category } from '../../data/exercises'
import { EXERCISE_CATEGORY_LABELS, getEquipmentLabel } from '../../src/lib/exerciseLabels'
import type { RecentExercisePick } from '../../src/shared/recentExercises'
import type { ExerciseRef } from '../../src/shared/exerciseMatch'
import { BottomSheet } from './BottomSheet'
import type { ExerciseSource } from './session'
import type { ExerciseMetadata, ReadState } from './scopedRead'
import { colors } from './theme'

const PICKER_CATEGORIES: { value: Category | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  ...(['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio'] as const).map((value) => ({ value, label: EXERCISE_CATEGORY_LABELS[value] ?? value })),
]

type PickerResult = { id: string; name: string; category: string; equipment: string; source: ExerciseSource }

export default function ExercisePicker({ userExercises, recent = [], suggestions = [], title = 'Add exercise', onRetryUserExercises, onSelect, onClose }: {
  userExercises: ReadState<ExerciseMetadata[]>
  recent?: RecentExercisePick[]
  // Closest matches for a pasted line, listed first.
  suggestions?: ExerciseRef[]
  title?: string
  onRetryUserExercises: () => void
  onSelect: (id: string, name: string, source: ExerciseSource) => void
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (event) => setKeyboardHeight(event.endCoordinates.height))
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0))
    return () => { shown.remove(); hidden.remove() }
  }, [])
  const q = query.toLowerCase()
  const filtered = q !== '' || category !== 'all'
  // Matches web ordering: the user's own exercises first, then the shared library.
  const results: PickerResult[] = [
    ...(userExercises.status === 'ready' ? userExercises.data : [])
      .filter((exercise) => (!q || exercise.name.toLowerCase().includes(q)) && (category === 'all' || exercise.category === category))
      .map((exercise) => ({ ...exercise, source: 'user' as const })),
    ...searchExercises(query, category === 'all' ? undefined : category).map((exercise) => ({ ...exercise, source: 'global' as const })),
  ]
  const recentRows = filtered ? [] : recent.flatMap((pick) => {
    const exercise = pick.source === 'user' && userExercises.status === 'ready'
      ? userExercises.data.find(({ id }) => id === pick.id) : exerciseDb.find(({ id }) => id === pick.id)
    return exercise ? [{ ...exercise, name: pick.name, source: pick.source }] : []
  })
  const suggestedRows = filtered ? [] : suggestions.flatMap((ref) => {
    const exercise = ref.exerciseSource === 'user' && userExercises.status === 'ready'
      ? userExercises.data.find(({ id }) => id === ref.exerciseId) : ref.exerciseSource === 'global' ? exerciseDb.find(({ id }) => id === ref.exerciseId) : undefined
    return exercise ? [{ ...exercise, source: ref.exerciseSource }] : []
  })
  return <BottomSheet tall title={title} onClose={onClose}>{(close) => {
    const row = (item: PickerResult) => <Pressable key={`${item.source}-${item.id}`} accessibilityRole="button" accessibilityLabel={`${item.name}${item.source === 'user' ? ', mine' : ''}`}
      onPress={() => close(() => onSelect(item.id, item.name, item.source))} style={({ pressed }) => [styles.pickerResult, pressed && styles.pickerPressed]}>
      <View style={styles.pickerResultMain}>
        <Text numberOfLines={1} style={styles.pickerResultName}>{item.name}</Text>
        {item.source === 'user' && <Text style={styles.pickerMine}>mine</Text>}
      </View>
      <Text numberOfLines={1} style={styles.pickerMeta}>{[EXERCISE_CATEGORY_LABELS[item.category], getEquipmentLabel(item.equipment)].filter(Boolean).join(' · ')}</Text>
    </Pressable>
    return <>
      <View style={styles.pickerSearch}>
        <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="m21 21-4.34-4.34M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" fill="none" stroke={colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        <TextInput accessibilityLabel="Search exercises" onChangeText={setQuery} placeholder="Search exercises" placeholderTextColor={colors.mutedSoft}
          returnKeyType="search" selectionColor={colors.accentText} style={styles.pickerSearchInput} value={query} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.pickerCategoriesBar} contentContainerStyle={styles.pickerCategories}
        accessibilityLabel="Exercise category">
        {PICKER_CATEGORIES.map(({ value, label }) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: category === value }}
          onPress={() => setCategory(value)} style={({ pressed }) => [styles.pickerCategory, category === value && styles.pickerCategoryActive, pressed && styles.pickerPressed]}>
          <Text style={[styles.pickerCategoryText, category === value && styles.pickerCategoryTextActive]}>{label}</Text>
        </Pressable>)}
      </ScrollView>
      <FlatList
        style={styles.flex}
        data={results}
        keyExtractor={(item) => `${item.source}-${item.id}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: Math.max(16, insets.bottom + 8) + keyboardHeight }}
        ListHeaderComponent={<>
          {userExercises.status === 'loading' && <Text accessibilityLiveRegion="polite" style={styles.pickerFeedback}>Loading your exercises…</Text>}
          {userExercises.status === 'error' && <Pressable accessibilityRole="button" onPress={onRetryUserExercises} style={styles.lookupAction}>
            <Text style={styles.pickerFeedback}>Could not load your exercises. The shared library is still available. <Text style={styles.syncActionText}>Retry</Text></Text>
          </Pressable>}
          {suggestedRows.length > 0 && <Text accessibilityRole="header" style={styles.pickerGroup}>Closest matches</Text>}
          {suggestedRows.map(row)}
          {recentRows.length > 0 && <Text accessibilityRole="header" style={styles.pickerGroup}>Recently used</Text>}
          {recentRows.map(row)}
          {results.length > 0 && <Text accessibilityRole="header" style={styles.pickerGroup}>{filtered ? `${results.length} found` : 'All exercises'}</Text>}
        </>}
        ListEmptyComponent={userExercises.status === 'ready' ? <View style={styles.pickerEmpty}>
          <Text style={styles.pickerEmptyTitle}>No results</Text>
          <Text style={styles.pickerEmptyCopy}>Change your search or choose another category.</Text>
        </View> : null}
        renderItem={({ item }) => row(item)}
      />
    </>
  }}</BottomSheet>
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lookupAction: { minHeight: 44, justifyContent: 'center' },
  syncActionText: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 12 },
  pickerMeta: { color: colors.muted, flexShrink: 0, fontFamily: 'InstrumentSans_400Regular', fontSize: 13.5, fontVariant: ['tabular-nums'] },
  pickerPressed: { opacity: 0.6 },
  pickerSearch: { alignItems: 'center', backgroundColor: 'rgba(244, 238, 232, 0.08)', borderRadius: 12, flexDirection: 'row', gap: 8, height: 42, paddingHorizontal: 12 },
  pickerSearchInput: { color: colors.textStrong, flex: 1, fontFamily: 'InstrumentSans_400Regular', fontSize: 14.5, padding: 0 },
  pickerCategoriesBar: { flexGrow: 0, marginRight: -20, marginTop: 10 },
  pickerCategories: { gap: 6, paddingRight: 20 },
  pickerCategory: { alignItems: 'center', borderColor: colors.line, borderRadius: 10, borderWidth: 1, height: 44, justifyContent: 'center', paddingHorizontal: 12 },
  pickerCategoryActive: { backgroundColor: 'rgba(244, 238, 232, 0.08)', borderColor: 'transparent' },
  pickerCategoryText: { color: colors.muted, fontFamily: 'InstrumentSans_500Medium', fontSize: 13.5 },
  pickerCategoryTextActive: { color: colors.text },
  pickerFeedback: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18, paddingVertical: 10 },
  pickerGroup: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13, marginBottom: 2, marginTop: 12 },
  pickerResult: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', minHeight: 44 },
  pickerResultMain: { alignItems: 'baseline', flex: 1, flexDirection: 'row', gap: 8.8 },
  pickerResultName: { color: colors.text, flexShrink: 1, fontFamily: 'InstrumentSans_400Regular', fontSize: 15 },
  pickerMine: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 11 },
  pickerEmpty: { alignItems: 'center', gap: 5.6, justifyContent: 'center', minHeight: 208 },
  pickerEmptyTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 16 },
  pickerEmptyCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13.12, textAlign: 'center' },
})
