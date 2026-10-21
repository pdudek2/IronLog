import { useCallback, useEffect, useRef, useState } from 'react'
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native'
import { useFocusEffect, usePathname, useRouter, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { useActiveRuntime, useAuthRuntime, useClosureRuntime } from './runtime'
import { useLaunchRuntime } from './launchRuntime'
import { navigationSection, scrollNavigation, tabNavigation, workoutNavigationAction } from './navigation'
import { colors, primaryGradient } from './theme'

export type NavigationExit = (proceed: () => void | Promise<boolean>) => void
const initialScroll = { y: 0, start: 0, direction: 0, hidden: false }
export function useBottomNavigation() {
  const [keyboard, setKeyboard] = useState(Keyboard.isVisible())
  const [inputFocused, setInputFocused] = useState(false)
  const [hidden, setHidden] = useState(false)
  const scroll = useRef(initialScroll)
  useFocusEffect(useCallback(() => {
    scroll.current = initialScroll; setHidden(false); setInputFocused(false); setKeyboard(Keyboard.isVisible())
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true))
    const hide = Keyboard.addListener('keyboardDidHide', () => { setKeyboard(false); setInputFocused(false) })
    return () => { show.remove(); hide.remove() }
  }, []))
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scroll.current = scrollNavigation(scroll.current, event.nativeEvent.contentOffset.y)
    setHidden(scroll.current.hidden)
  }, [])
  // Input focus hides the bar ahead of the soft keyboard. When no keyboard follows (hardware keyboard, or the exercise
  // picker closed: its input unmounts with no blur and React Native still reports it focused) the bar comes back.
  useEffect(() => {
    if (!inputFocused || keyboard) return
    const timer = setTimeout(() => setInputFocused(false), 600)
    return () => clearTimeout(timer)
  }, [inputFocused, keyboard])
  // Focus also bubbles from buttons under a hardware keyboard or D-pad; only a text input hides the bar.
  return { onScroll, hidden, keyboard: keyboard || inputFocused,
    onFocus: () => setInputFocused(TextInput.State.currentlyFocusedInput() != null), onBlur: () => setInputFocused(false) }
}

function Icon({ name, color }: { name: string; color: string }) {
  return <Svg accessibilityElementsHidden width={name === 'plus' || name === 'resume' ? 22 : 20} height={name === 'plus' || name === 'resume' ? 22 : 20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={name === 'plus' || name === 'resume' ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
    {name === 'Home' ? <>{[[3,3,9],[14,3,5],[14,12,9],[3,16,5]].map(([x,y,h]) => <Rect key={`${x}:${y}`} x={x} y={y} width={7} height={h} rx={1} />)}</>
      : <Path d={name === 'Plans' ? 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12 M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17'
        : name === 'Progress' ? 'M16 7h6v6 M22 7l-8.5 8.5-5-5L2 17'
        : name === 'Coach' ? 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z M20 2v4 M22 4h-4'
        : name === 'resume' ? 'M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z M2.5 21.5l1.4-1.4 M20.1 3.9l1.4-1.4 M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 1 0-2.828 2.829z M9.6 14.4l4.8-4.8'
        : 'M12 5v14M5 12h14'} />}
    {name === 'Coach' && <Circle cx={4} cy={20} r={2} />}
  </Svg>
}

export default function BottomNavigation({ hidden, keyboard, onRequestExit }: { hidden: boolean; keyboard: boolean; onRequestExit?: NavigationExit }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuthRuntime()
  const active = useActiveRuntime()
  const closure = useClosureRuntime()
  const launch = useLaunchRuntime()
  const inset = useSafeAreaInsets().bottom
  const section = navigationSection(pathname)
  const action = workoutNavigationAction(active.state.status, closure.closure.status, launch.state.status)
  const current = useRef({ action, closure, launch })
  current.current = { action, closure, launch }
  const busy = useRef(false)
  const owner = useRef(user?.uid)
  owner.current = user?.uid
  // The guard can outlive its screen while a confirmation dialog is open.
  const focused = useRef(false)
  useFocusEffect(useCallback(() => { focused.current = true; return () => { focused.current = false } }, []))
  const go = (proceed: () => void | Promise<boolean>) => {
    const uid = user?.uid
    const guarded = () => { if (focused.current && owner.current === uid) return proceed(); return Promise.resolve(false) }
    if (onRequestExit) onRequestExit(guarded)
    else void guarded()
  }
  const workout = () => {
    if (busy.current || action === 'wait') return
    go(() => {
      const { action: latest, closure: currentClosure, launch: currentLaunch } = current.current
      if (latest === 'wait') return Promise.resolve(false)
      if (latest === 'resume' || currentClosure.closure.status !== 'ready') { router.dismissTo('/'); return }
      if (latest === 'recover') { router.navigate('/dashboard'); return }
      busy.current = true
      // Launch owns the redirect. Release the editor exit lock if it stays open after a failed attempt.
      return currentLaunch.start({ kind: 'empty' }).then(() => false).finally(() => { busy.current = false })
    })
  }
  const height = 51.4 + Math.max(8, inset)
  return <View style={{ height: keyboard ? 0 : height }} pointerEvents={hidden || keyboard ? 'none' : 'auto'}
    accessibilityElementsHidden={hidden || keyboard} importantForAccessibility={hidden || keyboard ? 'no-hide-descendants' : 'auto'}>
    <View style={[styles.bar, { height, paddingBottom: Math.max(8, inset), transform: [{ translateY: hidden || keyboard ? height : 0 }], opacity: hidden || keyboard ? 0 : 1 }]}>
      {(['Home', 'Plans', 'Workout', 'Progress', 'Coach'] as const).map(name => name === 'Workout'
        ? <Pressable key={name} accessibilityRole="button" accessibilityLabel={action === 'resume' ? 'Resume workout' : action === 'recover' ? 'Recover workout' : 'Start new workout'} accessibilityState={{ disabled: action === 'wait', selected: section === 'Workout' }} disabled={action === 'wait'} onPress={workout} style={[styles.primary, action === 'wait' && { opacity: 0.5 }]}><Icon name={action === 'resume' ? 'resume' : 'plus'} color={colors.textStrong} /></Pressable>
        : <Pressable key={name} accessibilityRole="tab" accessibilityLabel={name} accessibilityState={{ selected: section === name }} onPress={() => go(() => { const { kind, href } = tabNavigation(pathname, name); router[kind](href as Href) })} style={[styles.tab, section === name && styles.selected]}><Icon name={name} color={section === name ? colors.textStrong : colors.muted} /><Text style={[styles.label, section === name && { color: colors.textStrong }]}>{name}</Text></Pressable>)}
    </View>
  </View>
}
const styles = StyleSheet.create({
  bar: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: 'rgba(15,14,16,0.98)', flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 6.4, paddingHorizontal: 8 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 8, overflow: 'hidden' },
  selected: { backgroundColor: 'rgba(244,241,242,0.075)' },
  label: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, lineHeight: 16, includeFontPadding: false, color: colors.muted },
  primary: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#b5213a', experimental_backgroundImage: primaryGradient },
})
