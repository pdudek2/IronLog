import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import Svg, { Path } from 'react-native-svg'

import { logout } from './firebase'
import { useAuthRuntime } from './runtime'
import { useStreak } from './streak'

export type HeaderAction = 'home' | 'plans' | 'progress' | 'profile' | 'signOut'

export default function HistoryHeader({ onRequestAction }: { onRequestAction?: (action: HeaderAction, proceed: () => void | Promise<boolean>) => void } = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const [signingOut, setSigningOut] = useState(false)
  const streak = useStreak(useAuthRuntime().user?.uid)

  const signOut = async () => {
    if (signingOut) return false
    setSigningOut(true)
    try {
      await logout()
      router.replace('/')
      return true
    } catch {
      Alert.alert('Could not sign out', 'Check your connection and try again.')
      setSigningOut(false)
      return false
    }
  }

  return <View style={styles.header}>
    <Pressable accessibilityRole="button" accessibilityLabel="Open Home" hitSlop={6} onPress={() => onRequestAction ? onRequestAction('home', () => router.replace('/dashboard')) : router.navigate('/dashboard')} style={styles.brand}>
      <Text style={styles.brandText}>IL</Text>
      <View style={styles.brandDot} />
    </Pressable>
    <View style={styles.actions}>
    {streak > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`Workout streak ${streak} ${streak === 1 ? 'day' : 'days'}`} onPress={() => onRequestAction ? onRequestAction('progress', () => router.navigate('/progress')) : router.navigate('/progress')} style={styles.streak}>
      <Svg accessibilityElementsHidden height={13} width={13} viewBox="0 0 24 24" fill="none" stroke="#8fb8a0" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4" /></Svg>
      <Text style={styles.streakText}>{streak}</Text>
    </Pressable>}
    <Pressable accessibilityRole="button" accessibilityLabel="Profile" accessibilityState={{ selected: pathname === '/profile' }} onPress={() => onRequestAction ? onRequestAction('profile', () => router.navigate('/profile')) : router.navigate('/profile')} style={[styles.signOut, pathname === '/profile' && styles.selected]}>
      <Svg accessibilityElementsHidden height={16} width={16} viewBox="0 0 24 24" fill="none" stroke={pathname === '/profile' ? '#f4f1f2' : '#a09aa0'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0" /></Svg>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Sign out" disabled={signingOut} onPress={() => onRequestAction ? onRequestAction('signOut', signOut) : void signOut()} style={styles.signOut}>
      <Svg accessibilityElementsHidden height={15} width={15} viewBox="0 0 24 24">
        <Path d="m16 17 5-5-5-5" fill="none" stroke="#a09aa0" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        <Path d="M21 12H9" fill="none" stroke="#a09aa0" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" fill="none" stroke="#a09aa0" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      </Svg>
    </Pressable>
    </View>
  </View>
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', backgroundColor: '#0d0c0e', borderBottomColor: 'rgba(244, 241, 242, 0.12)', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', height: 64, justifyContent: 'space-between', paddingHorizontal: 16 },
  brand: { alignItems: 'center', backgroundColor: 'rgba(17,16,18,0.76)', borderColor: 'rgba(244, 241, 242, 0.18)', borderRadius: 8, borderWidth: 1, height: 32, justifyContent: 'center', width: 32, experimental_backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.045))' },
  brandText: { color: '#fff', fontFamily: 'Archivo_800ExtraBold', fontSize: 12 },
  brandDot: { backgroundColor: '#ff7182', borderRadius: 2, bottom: 4, height: 4, position: 'absolute', right: 4, width: 4 },
  selected: { backgroundColor: 'rgba(244,241,242,0.075)', borderRadius: 8 },
  signOut: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  streak: { alignItems: 'center', backgroundColor: 'rgba(143, 184, 160, 0.13)', borderColor: 'rgba(143, 184, 160, 0.24)', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6.4, minHeight: 44, minWidth: 44, justifyContent: 'center', paddingLeft: 8.8, paddingRight: 12 },
  streakText: { color: '#8fb8a0', fontFamily: 'InstrumentSans_700Bold', fontSize: 13, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
