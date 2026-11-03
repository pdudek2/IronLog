import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, primaryGradient } from './theme'

// Puls replacement for Alert.alert, with the web ConfirmDialog look: cancel first and quiet,
// the confirming or destructive action in bone; a destructive dialog gets the seam on top.
export type DialogButton = { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }
type Dialog = { title: string; message?: string; buttons: DialogButton[]; onDismiss?: () => void }

let present: ((dialog: Dialog | null) => void) | null = null

export function showDialog(title: string, message?: string, buttons: DialogButton[] = [{ text: 'OK' }], options?: { onDismiss?: () => void }) {
  present?.({ title, message, buttons, onDismiss: options?.onDismiss })
}

export function DialogHost() {
  const [dialog, setDialog] = useState<Dialog | null>(null)
  useEffect(() => {
    present = setDialog
    return () => { if (present === setDialog) present = null }
  }, [])
  if (!dialog) return null
  const cancel = dialog.buttons.find((button) => button.style === 'cancel')
  const dismiss = () => { setDialog(null); cancel?.onPress?.(); dialog.onDismiss?.() }
  return <ConfirmDialog title={dialog.title} message={dialog.message} buttons={dialog.buttons.map((button) => ({
    ...button, onPress: () => { setDialog(null); button.onPress?.() },
  }))} onRequestClose={dismiss} />
}

export function ConfirmDialog({ title, message, buttons, onRequestClose }: { title: string; message?: string; buttons: DialogButton[]; onRequestClose: () => void }) {
  const insets = useSafeAreaInsets()
  const confirming = buttons.some((button) => button.style === 'cancel')
  const destructive = buttons.some((button) => button.style === 'destructive')
  return <Modal transparent animationType="fade" visible onRequestClose={onRequestClose} statusBarTranslucent navigationBarTranslucent>
    <View style={[styles.overlay, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
      <Pressable accessibilityElementsHidden importantForAccessibility="no" onPress={onRequestClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={styles.panel}>
        {destructive && <View style={styles.seam} />}
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        {!!message && <Text style={styles.copy}>{message}</Text>}
        <View style={[styles.actions, buttons.length > 2 && styles.stacked]}>
          {buttons.map((button, index) => {
            const kind = button.style === 'cancel' ? 'cancel' : button.style === 'destructive' ? 'danger' : confirming && index === buttons.length - 1 ? 'primary' : 'neutral'
            return <Pressable key={button.text} accessibilityRole="button" onPress={button.onPress} style={({ pressed }) => [styles.button, styles[kind], pressed && styles.pressed]}>
              <Text style={[styles.buttonText, styles[`${kind}Text`]]}>{button.text}</Text>
            </Pressable>
          })}
        </View>
      </View>
    </View>
  </Modal>
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 16, backgroundColor: 'rgba(13, 11, 10, 0.6)' },
  panel: { width: '100%', maxWidth: 384, padding: 20, overflow: 'hidden', borderRadius: 20, backgroundColor: colors.surfaceRaised, experimental_backgroundImage: `linear-gradient(180deg, ${colors.surfaceHigh}, ${colors.surfaceRaised})`, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)' },
  seam: { position: 'absolute', top: 0, left: 20, right: 20, height: 2, backgroundColor: colors.seam },
  title: { color: colors.textStrong, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 19, lineHeight: 25, letterSpacing: -0.2, marginBottom: 8 },
  copy: { color: colors.muted, fontFamily: 'InstrumentSans_400Regular', fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  stacked: { flexDirection: 'column-reverse' },
  button: { flex: 1, minHeight: 52, paddingVertical: 10, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', borderRadius: 15 },
  pressed: { opacity: 0.8 },
  cancel: { backgroundColor: 'rgba(255, 255, 255, 0.08)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' },
  neutral: { backgroundColor: 'rgba(255, 255, 255, 0.08)', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' },
  primary: { backgroundColor: colors.primaryEnd, experimental_backgroundImage: primaryGradient, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 2px 8px rgba(0, 0, 0, 0.35)' },
  danger: { backgroundColor: colors.primaryEnd, experimental_backgroundImage: primaryGradient, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 2px 8px rgba(0, 0, 0, 0.35)' },
  buttonText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16, textAlign: 'center' },
  cancelText: { color: colors.text },
  neutralText: { color: colors.text },
  primaryText: { color: colors.onPrimary },
  dangerText: { color: colors.onPrimary },
})
