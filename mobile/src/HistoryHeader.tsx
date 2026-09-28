import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import Svg, { Path } from 'react-native-svg'

import { logout } from './firebase'

export default function HistoryHeader({ onRequestAction }: { onRequestAction?: (action: 'home' | 'plans' | 'signOut', proceed: () => void | Promise<boolean>) => void } = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const [signingOut, setSigningOut] = useState(false)

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
    <Pressable accessibilityRole="button" accessibilityLabel="Open Plans" accessibilityState={{ selected: pathname === '/templates' }} onPress={() => onRequestAction ? onRequestAction('plans', () => router.replace('/templates')) : router.navigate('/templates')} style={styles.plans}><Text style={[styles.plansText, pathname === '/templates' && styles.plansActive]}>Plans</Text></Pressable>
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
  signOut: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plans: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  plansText: { color: '#a09aa0', fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13 },
  plansActive: { color: '#ff7182' },
})
