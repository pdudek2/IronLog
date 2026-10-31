import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import Svg, { Path } from 'react-native-svg'

import { useAuthRuntime } from './runtime'
import { useStreak } from './streak'
import { colors } from './theme'
import { BrandMark } from './icons'

export type HeaderAction = 'home' | 'progress' | 'profile'

export default function HistoryHeader({ onRequestAction }: { onRequestAction?: (action: HeaderAction, proceed: () => void | Promise<boolean>) => void } = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const streak = useStreak(useAuthRuntime().user?.uid)

  return <View style={styles.header}>
    <Pressable accessibilityRole="button" accessibilityLabel="Open Train" hitSlop={6} onPress={() => onRequestAction ? onRequestAction('home', () => router.replace('/dashboard')) : router.navigate('/dashboard')} style={styles.brand}>
      <BrandMark width={18} />
    </Pressable>
    <View style={styles.actions}>
    {streak > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`Workout streak ${streak} ${streak === 1 ? 'day' : 'days'}`} onPress={() => onRequestAction ? onRequestAction('progress', () => router.navigate('/progress')) : router.navigate('/progress')} style={styles.streakTarget}><View style={styles.streak}>
      <Svg accessibilityElementsHidden height={13} width={13} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4" /></Svg>
      <Text style={styles.streakText}>{streak}</Text>
    </View></Pressable>}
    <Pressable accessibilityRole="button" accessibilityLabel="Profile" accessibilityState={{ selected: pathname === '/profile' }} onPress={() => onRequestAction ? onRequestAction('profile', () => router.navigate('/profile')) : router.navigate('/profile')} style={[styles.iconButton, pathname === '/profile' && styles.selected]}>
      <Svg accessibilityElementsHidden height={16} width={16} viewBox="0 0 24 24" fill="none" stroke={pathname === '/profile' ? colors.text : colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0" /></Svg>
    </Pressable>
    </View>
  </View>
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', backgroundColor: '#0f0d0c', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 64, justifyContent: 'space-between', paddingHorizontal: 16 },
  brand: { alignItems: 'center', backgroundColor: 'rgba(20, 17, 16,0.76)', borderColor: 'rgba(244, 238, 232, 0.18)', borderRadius: 8, borderWidth: 1, height: 32, justifyContent: 'center', width: 32, experimental_backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.045))' },
  selected: { backgroundColor: 'rgba(244, 238, 232,0.075)', borderRadius: 8 },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  streakTarget: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  streak: { alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.035)', borderRadius: 999, flexDirection: 'row', gap: 6.4, paddingVertical: 5, paddingLeft: 8.8, paddingRight: 12 },
  streakText: { color: colors.muted, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
