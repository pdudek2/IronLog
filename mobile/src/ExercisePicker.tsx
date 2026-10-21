import { useState } from 'react'
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'

import { searchExercises, type Category } from '../../data/exercises'
import { EXERCISE_CATEGORY_LABELS, formatExerciseMeta } from '../../src/lib/exerciseLabels'
import { pluralize } from '../../src/lib/pluralize'
import type { ExerciseSource } from './session'
import type { ExerciseMetadata, ReadState } from './scopedRead'
import { colors } from './theme'

const PICKER_CATEGORIES: { value: Category | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  ...(['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio'] as const).map((value) => ({ value, label: EXERCISE_CATEGORY_LABELS[value] ?? value })),
]

type PickerResult = { id: string; name: string; source: ExerciseSource; equipment: string; muscles: string[] }

export default function ExercisePicker({ userExercises, onRetryUserExercises, onSelect, onClose }: {
  userExercises: ReadState<ExerciseMetadata[]>
  onRetryUserExercises: () => void
  onSelect: (id: string, name: string, source: ExerciseSource) => void
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [searchFocused, setSearchFocused] = useState(false)
  const q = query.toLowerCase()
  // Matches web ordering: the user's own exercises first, then the shared library.
  const results: PickerResult[] = [
    ...(userExercises.status === 'ready' ? userExercises.data : [])
      .filter((exercise) => (!q || exercise.name.toLowerCase().includes(q)) && (category === 'all' || exercise.category === category))
      .map((exercise) => ({ ...exercise, source: 'user' as const })),
    ...searchExercises(query, category === 'all' ? undefined : category).map((exercise) => ({ ...exercise, source: 'global' as const })),
  ]
  return <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent visible>
    <View style={[styles.pickerShell, { paddingTop: Math.max(12.8, insets.top) }]}>
      <View style={styles.pickerHead}>
        <View style={styles.pickerTitleRow}>
          <View style={styles.pickerTitleGroup}>
            <Text accessibilityRole="header" style={styles.pickerTitle}>Choose an exercise</Text>
            <Text style={styles.pickerMeta}>{results.length} {pluralize(results.length, 'result', 'results')}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close exercise picker" onPress={onClose}
            style={({ pressed }) => [styles.pickerClose, pressed && styles.pickerPressed]}>
            <Svg width={17} height={17} viewBox="0 0 24 24"><Path d="m18 6-12 12M6 6l12 12" fill="none" stroke={colors.muted} strokeWidth={2} strokeLinecap="round" /></Svg>
          </Pressable>
        </View>
        <View style={[styles.pickerSearch, searchFocused && styles.pickerSearchFocused]}>
          <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="m21 21-4.34-4.34M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" fill="none" stroke={colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          <TextInput accessibilityLabel="Search exercises" autoFocus onBlur={() => setSearchFocused(false)} onChangeText={setQuery}
            onFocus={() => setSearchFocused(true)} placeholder="Search exercises..." placeholderTextColor={colors.mutedSoft}
            returnKeyType="search" selectionColor={colors.accentText} style={styles.pickerSearchInput} value={query} />
        </View>
      </View>
      <View style={styles.pickerCategoriesBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pickerCategories}
          accessibilityLabel="Exercise category">
          {PICKER_CATEGORIES.map(({ value, label }) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: category === value }}
            onPress={() => setCategory(value)} style={({ pressed }) => [styles.pickerCategory, pressed && styles.pickerPressed]}>
            <Text style={[styles.pickerCategoryText, category === value && styles.pickerCategoryTextActive]}>{label}</Text>
            {category === value && <View style={styles.pickerCategoryUnderline} />}
          </Pressable>)}
        </ScrollView>
      </View>
      <FlatList
        data={results}
        keyExtractor={(item) => `${item.source}-${item.id}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.pickerList, { paddingBottom: Math.max(12, insets.bottom) }]}
        ListHeaderComponent={userExercises.status === 'loading'
          ? <Text accessibilityLiveRegion="polite" style={styles.pickerFeedback}>Loading your exercises…</Text>
          : userExercises.status === 'error'
            ? <Pressable accessibilityRole="button" onPress={onRetryUserExercises} style={styles.lookupAction}>
              <Text style={styles.pickerFeedback}>Could not load your exercises. The shared library is still available. <Text style={styles.syncActionText}>Retry</Text></Text>
            </Pressable>
            : null}
        ListEmptyComponent={userExercises.status === 'ready' ? <View style={styles.pickerEmpty}>
          <Text style={styles.pickerEmptyTitle}>No results</Text>
          <Text style={styles.pickerEmptyCopy}>Change your search or choose another category.</Text>
        </View> : null}
        renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}${item.source === 'user' ? ', mine' : ''}`}
          onPress={() => onSelect(item.id, item.name, item.source)} style={({ pressed }) => [styles.pickerResult, pressed && styles.pickerPressed]}>
          <View style={styles.pickerResultMain}>
            <Text numberOfLines={1} style={styles.pickerResultName}>{item.name}</Text>
            {item.source === 'user' && <Text style={styles.pickerMine}>mine</Text>}
          </View>
          <Text style={styles.pickerMeta}>{formatExerciseMeta(item.equipment, item.muscles)}</Text>
        </Pressable>}
      />
    </View>
  </Modal>
}

const styles = StyleSheet.create({
  pickerShell: { backgroundColor: colors.backgroundElevated, flex: 1 },
  lookupAction: { minHeight: 44, justifyContent: 'center' },
  syncActionText: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 12 },
  pickerHead: { gap: 12, paddingBottom: 13.6, paddingHorizontal: 16 },
  pickerTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  pickerTitleGroup: { alignItems: 'baseline', flexDirection: 'row', flexShrink: 1, gap: 10.4 },
  pickerTitle: { color: colors.textStrong, fontFamily: 'ArchivoHeading', fontSize: 18.4 },
  pickerMeta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 11.52, lineHeight: 17 },
  pickerClose: { alignItems: 'center', borderRadius: 8, height: 44, justifyContent: 'center', width: 44 },
  pickerPressed: { backgroundColor: 'rgba(255, 255, 255, 0.035)' },
  pickerSearch: { alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.045)', borderRadius: 8, flexDirection: 'row', gap: 9.6, minHeight: 44, paddingHorizontal: 12 },
  pickerSearchFocused: { boxShadow: '0 0 0 2px rgba(240, 67, 90, 0.24)' },
  pickerSearchInput: { color: colors.textStrong, flex: 1, fontFamily: 'InstrumentSans_400Regular', fontSize: 14.4, minHeight: 44, padding: 0 },
  pickerCategoriesBar: { borderBottomColor: colors.line, borderBottomWidth: 1 },
  pickerCategories: { paddingLeft: 16, paddingRight: 48 },
  pickerCategory: { justifyContent: 'center', minHeight: 44, paddingHorizontal: 10.4 },
  pickerCategoryText: { color: colors.muted, fontFamily: 'InstrumentSans_700Bold', fontSize: 11.84, lineHeight: 18 },
  pickerCategoryTextActive: { color: colors.textStrong },
  pickerCategoryUnderline: { backgroundColor: colors.accent, bottom: -1, height: 2, left: 10.4, position: 'absolute', right: 10.4 },
  pickerList: { paddingHorizontal: 16 },
  pickerFeedback: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 12, lineHeight: 18, paddingVertical: 10 },
  pickerResult: { borderBottomColor: colors.line, borderBottomWidth: 1, gap: 4.5, justifyContent: 'center', minHeight: 58.4, paddingVertical: 11.5 },
  pickerResultMain: { alignItems: 'baseline', flexDirection: 'row', gap: 8.8 },
  pickerResultName: { color: colors.textStrong, flexShrink: 1, fontFamily: 'InstrumentSans_700Bold', fontSize: 16, lineHeight: 20 },
  pickerMine: { color: colors.accentText, fontFamily: 'InstrumentSans_700Bold', fontSize: 11 },
  pickerEmpty: { alignItems: 'center', gap: 5.6, justifyContent: 'center', minHeight: 208 },
  pickerEmptyTitle: { color: colors.textStrong, fontFamily: 'InstrumentSans_700Bold', fontSize: 16 },
  pickerEmptyCopy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 13.12, textAlign: 'center' },
})
