import { useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { SHEET_DRAG_ELASTIC, SHEET_SPRING, shouldDismissSheet } from '../../src/shared/sheetMotion'
import { Icon } from './icons'
import { colors } from './theme'

type Close = (after?: () => void) => void

export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: (close: Close) => ReactNode }) {
  const insets = useSafeAreaInsets()
  const { height: screen } = useWindowDimensions()
  const y = useRef(new Animated.Value(screen)).current
  const motion = useRef({ height: 0, reduced: false, closing: false })
  const [height, setHeight] = useState(0)

  const moveTo = (toValue: number, velocity: number, done?: () => void) => {
    if (motion.current.reduced) {
      y.setValue(toValue)
      done?.()
      return
    }
    Animated.spring(y, { toValue, velocity, useNativeDriver: true, restDisplacementThreshold: 1, restSpeedThreshold: 40, ...SHEET_SPRING })
      .start(({ finished }) => { if (finished) done?.() })
  }
  const dismiss = (velocity = 0, after?: () => void) => {
    if (motion.current.closing) return
    motion.current.closing = true
    moveTo(motion.current.height, velocity, () => { onClose(); after?.() })
  }
  const drag = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gesture) => y.setValue(Math.max(0, gesture.dy * SHEET_DRAG_ELASTIC)),
    onPanResponderRelease: (_, gesture) => {
      if (shouldDismissSheet(gesture.dy, gesture.vy * 1000)) dismiss(gesture.vy)
      else moveTo(0, gesture.vy)
    },
    onPanResponderTerminate: () => moveTo(0, 0),
  })).current

  return <Modal animationType="none" navigationBarTranslucent onRequestClose={() => dismiss()} statusBarTranslucent transparent visible>
    <View style={styles.layer}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: height ? y.interpolate({ inputRange: [0, height], outputRange: [1, 0], extrapolate: 'clamp' }) : 0 }]}>
        <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={() => dismiss()} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View accessibilityViewIsModal onLayout={(event) => {
        const measured = event.nativeEvent.layout.height
        const first = !motion.current.height
        motion.current.height = measured
        setHeight(measured)
        if (!first) return
        y.setValue(measured)
        void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
          motion.current.reduced = reduced
          moveTo(0, 0)
        })
      }} style={[styles.sheet, { paddingBottom: Math.max(28, insets.bottom + 12), transform: [{ translateY: y }] }]}>
        <View {...drag.panHandlers} style={styles.grab}>
          <View style={styles.handle} />
          <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</Text>
        </View>
        <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={() => dismiss()} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Icon name="close" size={18} />
        </Pressable>
        <ScrollView keyboardShouldPersistTaps="handled" style={[styles.body, { maxHeight: screen * 0.7 }]}>{children((after) => dismiss(0, after))}</ScrollView>
      </Animated.View>
    </View>
  </Modal>
}

const styles = StyleSheet.create({
  layer: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(13, 11, 10, 0.6)' },
  sheet: { backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 24, borderTopRightRadius: 24, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)', experimental_backgroundImage: `linear-gradient(180deg, ${colors.surfaceHigh}, ${colors.surfaceRaised})`, paddingHorizontal: 20 },
  grab: { marginHorizontal: -20, paddingBottom: 12, paddingHorizontal: 20, paddingTop: 8 },
  handle: { alignSelf: 'center', backgroundColor: 'rgba(244, 238, 232, 0.28)', borderRadius: 2, height: 4, marginBottom: 12, width: 36 },
  title: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 19, letterSpacing: -0.3, paddingRight: 40 },
  close: { alignItems: 'center', height: 44, justifyContent: 'center', position: 'absolute', right: 8, top: 14, width: 44 },
  pressed: { opacity: 0.6 },
  body: { flexGrow: 0 },
})
