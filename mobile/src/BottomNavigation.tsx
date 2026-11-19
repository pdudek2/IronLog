import { useCallback, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, usePathname, useRouter, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import ActiveWorkoutReturnBar, { useReturnBar } from './ActiveWorkoutReturnBar'
import { useAuthRuntime } from './runtime'
import { navigationSection, tabNavigation, type NavigationTab } from './navigation'
import { colors } from './theme'

export type NavigationExit = (proceed: () => void | Promise<boolean>) => void

const TABS: Record<NavigationTab, string> = {
  Train: 'M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z m-15.096 8.732 1.4-1.4 m16.2-16.2 1.4-1.4 M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z m4.257-7.085 4.8-4.8',
  History: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M12 7v5l4 2',
  Progress: 'M16 7h6v6 M22 7l-8.5 8.5-5-5L2 17',
  Coach: 'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z',
}

function Icon({ name, color }: { name: NavigationTab; color: string }) {
  return <Svg accessibilityElementsHidden width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><Path d={TABS[name]} /></Svg>
}

const TAB_ROW_HEIGHT = 60
const RETURN_ROW_HEIGHT = 52

// The plate's height under a screen's own action row, which sits right above it and rides the keyboard over it.
export function usePlateHeight() {
  return (useReturnBar().visible ? RETURN_ROW_HEIGHT : 0) + TAB_ROW_HEIGHT + useSafeAreaInsets().bottom
}

// One flat plate at the bottom edge, part of the screen's column: the running workout above the tabs.
export default function BottomNavigation({ onRequestExit }: { onRequestExit?: NavigationExit }) {
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
  return <View style={styles.plate}>
    {returning && <ActiveWorkoutReturnBar onRequestExit={onRequestExit} />}
    <View accessibilityRole="tablist" style={[styles.tabs, returning && styles.divided]}>
      {(Object.keys(TABS) as NavigationTab[]).map(name => <Pressable key={name} accessibilityRole="tab" accessibilityLabel={name} accessibilityState={{ selected: section === name }} onPress={() => go(() => { const { kind, href } = tabNavigation(pathname, name); router[kind](href as Href) })} style={({ pressed }) => [styles.tab, pressed && styles.pressed]}><Icon name={name} color={section === name ? colors.textStrong : colors.muted} /><Text style={[styles.label, section === name && styles.labelSelected]}>{name}</Text></Pressable>)}
    </View>
    <View style={{ height: inset }} />
  </View>
}
// A screen's action row above the plate: same surface, divided by a hairline.
export const plateRow = { backgroundColor: colors.surface, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth } as const
const styles = StyleSheet.create({
  plate: { backgroundColor: colors.surface, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  tabs: { height: TAB_ROW_HEIGHT, flexDirection: 'row', alignItems: 'stretch' },
  divided: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  pressed: { opacity: 0.6 },
  label: { fontFamily: 'InstrumentSans_500Medium', fontSize: 12, lineHeight: 16, includeFontPadding: false, color: colors.muted },
  labelSelected: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold' },
})
