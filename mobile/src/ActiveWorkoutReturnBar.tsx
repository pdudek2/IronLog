import { useEffect, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import Svg, { Path } from 'react-native-svg'

import { formatElapsed } from './session'
import { useActiveRuntime, useClosureRuntime } from './runtime'

export default function ActiveWorkoutReturnBar() {
  const { state } = useActiveRuntime()
  const closure = useClosureRuntime()
  const pathname = usePathname()
  const router = useRouter()
  const [now, setNow] = useState(Date.now())
  const session = state.status === 'ready' ? state.session : null
  const startedAt = session?.startedAt

  useEffect(() => {
    if (startedAt === undefined) return
    const interval = setInterval(() => setNow(Date.now()), 1_000)
    const lifecycle = AppState.addEventListener('change', (appState) => {
      if (appState === 'active') setNow(Date.now())
    })
    return () => { clearInterval(interval); lifecycle.remove() }
  }, [startedAt])

  const justFinished = session && closure.completed
    && (closure.completed.action === 'finish' ? closure.completed.workoutId : closure.completed.sessionId) === session.sessionId
  if (!session || justFinished || pathname === '/') return null

  return (
    <View accessibilityLabel="Active workout" style={styles.bar}>
      <Svg accessibilityElementsHidden height={17} width={17} viewBox="0 0 24 24" fill="none" stroke="#ff7182" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}>
        <Path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" />
        <Path d="m2.5 21.5 1.4-1.4" /><Path d="m20.1 3.9 1.4-1.4" />
        <Path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" />
        <Path d="m9.6 14.4 4.8-4.8" />
      </Svg>
      <View style={styles.copy}>
        <Text style={styles.title}>Workout in progress</Text>
        {session.label?.trim() ? <Text numberOfLines={1} style={styles.label}>{session.label}</Text> : null}
      </View>
      <Text accessibilityLabel={`Elapsed time ${formatElapsed(session.startedAt, now)}`} style={styles.elapsed}>
        {formatElapsed(session.startedAt, now)}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Return to workout" onPress={() => router.dismissTo('/')} style={styles.returnButton}>
        <Text style={styles.returnText}>Return</Text>
        <Svg accessibilityElementsHidden height={15} width={15} viewBox="0 0 24 24"><Path d="m9 18 6-6-6-6" fill="none" stroke="#ff7182" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></Svg>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center', backgroundColor: 'rgba(20, 18, 21, 0.97)', borderBottomColor: 'rgba(240, 67, 90, 0.35)', borderBottomWidth: 1,
    flexDirection: 'row', gap: 10, minHeight: 58, paddingHorizontal: 16, paddingVertical: 6,
  },
  copy: { flex: 1, minWidth: 0 },
  title: { color: '#f4f1f2', fontFamily: 'InstrumentSans_700Bold', fontSize: 12.5, lineHeight: 15 },
  label: { color: '#a09aa0', fontFamily: 'InstrumentSans_400Regular', fontSize: 11, marginTop: 2 },
  elapsed: { color: '#f4f1f2', fontFamily: 'SplineSansMono_600SemiBold', fontSize: 12, fontVariant: ['tabular-nums'] },
  returnButton: { alignItems: 'center', flexDirection: 'row', gap: 2, justifyContent: 'center', minHeight: 44, paddingHorizontal: 4 },
  returnText: { color: '#ff7182', fontFamily: 'InstrumentSans_700Bold', fontSize: 12.5 },
})
