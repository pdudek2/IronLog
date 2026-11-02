import type { NavigationExit } from './BottomNavigation'
import { useEffect, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'

import { formatElapsed } from './session'
import { useActiveRuntime, useClosureRuntime } from './runtime'
import { colors } from './theme'

function useElapsed(startedAt: number | undefined) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (startedAt === undefined) return
    const interval = setInterval(() => setNow(Date.now()), 1_000)
    const lifecycle = AppState.addEventListener('change', (appState) => {
      if (appState === 'active') setNow(Date.now())
    })
    return () => { clearInterval(interval); lifecycle.remove() }
  }, [startedAt])
  return startedAt === undefined ? '' : formatElapsed(startedAt, now)
}

export function useReturnBar() {
  const { state } = useActiveRuntime()
  const closure = useClosureRuntime()
  const pathname = usePathname()
  const session = state.status === 'ready' ? state.session : null
  const justFinished = session && closure.completed
    && (closure.completed.action === 'finish' ? closure.completed.workoutId : closure.completed.sessionId) === session.sessionId
  // Without the session a failed closure has no other way back to the workout screen, where it is resolved.
  const unresolved = closure.closure.status !== 'ready' && closure.closure.status !== 'loading'
  // Train offers Resume as its main button instead.
  const hidden = justFinished || pathname === '/' || (session && pathname === '/dashboard') || (!session && !unresolved)
  return { session: justFinished ? null : session, visible: !hidden }
}

export function ResumeButton() {
  const { session } = useReturnBar()
  const router = useRouter()
  const elapsed = useElapsed(session?.startedAt)
  if (!session) return null
  return <Pressable accessibilityRole="button" accessibilityLabel={`Return to workout, ${elapsed}`} onPress={() => router.dismissTo('/')}
    style={({ pressed }) => [styles.resume, pressed && styles.pressed]}>
    <Text numberOfLines={1} style={styles.resumeText}>Resume {session.label?.trim() || 'workout'} · {elapsed}</Text>
  </Pressable>
}

export default function ActiveWorkoutReturnBar({ onRequestExit, top = false }: { onRequestExit?: NavigationExit; top?: boolean } = {}) {
  const { session, visible } = useReturnBar()
  const router = useRouter()
  const elapsed = useElapsed(session?.startedAt)
  if (!visible) return null
  const back = () => router.dismissTo('/')
  return <View accessibilityLabel="Active workout" style={[styles.bar, top && styles.barTop]}>
    <Text numberOfLines={1} style={styles.title}>{session ? session.label?.trim() || 'Workout' : 'Workout needs attention'} {session && <Text style={styles.elapsed}>{elapsed}</Text>}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Return to workout" onPress={() => onRequestExit ? onRequestExit(back) : back()}
      style={({ pressed }) => [styles.returnButton, pressed && styles.pressed]}>
      <Text style={styles.returnText}>Return</Text>
    </Pressable>
  </View>
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center', borderRadius: 16, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07)', experimental_backgroundImage: 'linear-gradient(180deg, ' + colors.surfaceRaised + ', ' + colors.surface + ')',
    flexDirection: 'row', gap: 12, height: 50, justifyContent: 'space-between', paddingLeft: 16, paddingRight: 6,
  },
  barTop: { marginHorizontal: 14, marginTop: 8 },
  title: { color: colors.text, flex: 1, fontFamily: 'InstrumentSans_500Medium', fontSize: 14.5 },
  elapsed: { color: colors.muted, fontVariant: ['tabular-nums'] },
  returnButton: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 12, height: 38, justifyContent: 'center', paddingHorizontal: 14 },
  returnText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14 },
  pressed: { opacity: 0.7 },
  resume: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 15, height: 52, justifyContent: 'center', paddingHorizontal: 16 },
  resumeText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16, fontVariant: ['tabular-nums'] },
})
