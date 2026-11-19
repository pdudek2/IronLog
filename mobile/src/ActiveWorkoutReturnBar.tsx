import type { NavigationExit } from './BottomNavigation'
import { useEffect, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'

import { formatElapsed } from './session'
import { useActiveRuntime, useOptionalClosureRuntime } from './runtime'
import { Icon } from './icons'
import { useRest } from './restClock'
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
  // Signed out, the closure provider is gone while the screens below Profile still render once.
  const closure = useOptionalClosureRuntime()
  const pathname = usePathname()
  if (!closure) return { session: null, visible: false }
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

// The running workout as one row: name, time and the rest left, the whole row returns. Its top edge is the rest line.
export default function ActiveWorkoutReturnBar({ onRequestExit, top = false, divided = false }: { onRequestExit?: NavigationExit; top?: boolean; divided?: boolean } = {}) {
  const { session, visible } = useReturnBar()
  const router = useRouter()
  const elapsed = useElapsed(session?.startedAt)
  const rest = useRest()
  const now = Date.now()
  const restLeft = rest && session && rest.sessionId === session.sessionId ? Math.max(0, rest.startedAt + rest.totalSec * 1000 - now) : 0
  if (!visible) return null
  const back = () => router.dismissTo('/')
  const seconds = Math.ceil(restLeft / 1000)
  const label = session ? session.label?.trim() || 'Workout' : 'Workout needs attention'
  return <Pressable accessibilityRole="button" accessibilityLabel={`Return to workout, ${label}${session ? `, ${elapsed}` : ''}${restLeft ? `, rest ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : ''}`}
    onPress={() => onRequestExit ? onRequestExit(back) : back()}
    style={({ pressed }) => [styles.row, (divided || top) && styles.divided, top && styles.rowTop, pressed && styles.pressed]}>
    {restLeft > 0 && rest && <View style={[styles.restLine, { width: `${(restLeft / (rest.totalSec * 1000)) * 100}%` }]} />}
    <Text numberOfLines={1} style={styles.title}>{label}{session && <Text style={styles.meta}>  {elapsed}{restLeft > 0 ? ` · rest ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : ''}</Text>}</Text>
    <Text style={styles.returnText}>Return</Text>
    <Icon name="chevron-right" size={16} color={colors.text} />
  </Pressable>
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: 6, height: 52, paddingHorizontal: 16 },
  rowTop: { backgroundColor: colors.surface },
  divided: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  restLine: { backgroundColor: colors.seam, height: 2, left: 0, position: 'absolute', top: -1 },
  title: { color: colors.textStrong, flex: 1, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14.5 },
  meta: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontVariant: ['tabular-nums'] },
  returnText: { color: colors.text, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14.5 },
  pressed: { opacity: 0.7 },
  resume: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: 15, height: 52, justifyContent: 'center', paddingHorizontal: 16 },
  resumeText: { color: colors.onPrimary, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16, fontVariant: ['tabular-nums'] },
})
