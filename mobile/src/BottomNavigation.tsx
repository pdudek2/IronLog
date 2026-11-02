import { useCallback, useEffect, useRef, useState } from 'react'
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native'
import { useFocusEffect, usePathname, useRouter, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import ActiveWorkoutReturnBar, { useReturnBar } from './ActiveWorkoutReturnBar'
import { useAuthRuntime } from './runtime'
import { navigationBarHeight, navigationSection, scrollNavigation, tabNavigation, type NavigationTab } from './navigation'
import { colors } from './theme'

export type NavigationExit = (proceed: () => void | Promise<boolean>) => void
const initialScroll = { y: 0, start: 0, direction: 0, hidden: false }
export function useBottomNavigation() {
  const [keyboard, setKeyboard] = useState(Keyboard.isVisible())
  const [inputFocused, setInputFocused] = useState(false)
  const [hidden, setHidden] = useState(false)
  const scroll = useRef(initialScroll)
  const inset = useSafeAreaInsets().bottom
  useFocusEffect(useCallback(() => {
    scroll.current = initialScroll; setHidden(false); setInputFocused(false); setKeyboard(Keyboard.isVisible())
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true))
    const hide = Keyboard.addListener('keyboardDidHide', () => { setKeyboard(false); setInputFocused(false) })
    return () => { show.remove(); hide.remove() }
  }, []))
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    scroll.current = scrollNavigation(scroll.current, contentOffset.y, contentSize.height - layoutMeasurement.height, navigationBarHeight(inset))
    setHidden(scroll.current.hidden)
  }, [inset])
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

const TABS: Record<NavigationTab, string> = {
  Train: 'M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z m-15.096 8.732 1.4-1.4 m16.2-16.2 1.4-1.4 M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z m4.257-7.085 4.8-4.8',
  History: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M12 7v5l4 2',
  Progress: 'M16 7h6v6 M22 7l-8.5 8.5-5-5L2 17',
  Coach: 'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z',
}

function Icon({ name, color }: { name: NavigationTab; color: string }) {
  return <Svg accessibilityElementsHidden width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><Path d={TABS[name]} /></Svg>
}

export default function BottomNavigation({ hidden, keyboard, onRequestExit }: { hidden: boolean; keyboard: boolean; onRequestExit?: NavigationExit }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuthRuntime()
  const inset = useSafeAreaInsets().bottom
  const section = navigationSection(pathname)
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
  const { visible: returning } = useReturnBar()
  const height = navigationBarHeight(inset)
  return <View style={{ height: keyboard || hidden ? 0 : height + (returning ? RETURN_ROW_HEIGHT : 0) }} pointerEvents={hidden || keyboard ? 'none' : 'auto'}
    accessibilityElementsHidden={hidden || keyboard} importantForAccessibility={hidden || keyboard ? 'no-hide-descendants' : 'auto'}>
    {returning && !keyboard && !hidden && <View style={[styles.returnRow, { bottom: Math.max(10, inset) + 66 }]}><ActiveWorkoutReturnBar onRequestExit={onRequestExit} /></View>}
    <View style={[styles.bar, { bottom: Math.max(10, inset), transform: [{ translateY: hidden || keyboard ? height : 0 }], opacity: hidden || keyboard ? 0 : 1 }]}>
      {(Object.keys(TABS) as NavigationTab[]).map(name => <Pressable key={name} accessibilityRole="tab" accessibilityLabel={name} accessibilityState={{ selected: section === name }} onPress={() => go(() => { const { kind, href } = tabNavigation(pathname, name); router[kind](href as Href) })} style={[styles.tab, section === name && styles.selected]}><Icon name={name} color={section === name ? colors.textStrong : colors.muted} /><Text style={[styles.label, section === name && { color: colors.textStrong }]}>{name}</Text></Pressable>)}
    </View>
  </View>
}
const RETURN_ROW_HEIGHT = 58
const styles = StyleSheet.create({
  returnRow: { left: 14, position: 'absolute', right: 14 },
  bar: { position: 'absolute', left: 14, right: 14, height: 58, flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4.8, borderRadius: 19.2, backgroundColor: colors.surfaceHigh, experimental_backgroundImage: `linear-gradient(180deg, ${colors.surfaceHigh}, ${colors.surfaceRaised})`, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 14px 30px -12px rgba(0, 0, 0, 0.8)' },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 14, overflow: 'hidden' },
  selected: { backgroundColor: colors.choiceSelected },
  label: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, lineHeight: 16, includeFontPadding: false, color: colors.muted },
})
