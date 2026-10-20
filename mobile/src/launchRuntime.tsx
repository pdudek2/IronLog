import { createContext, useContext, type ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useWorkoutLaunch } from './useWorkoutLaunch'

type LaunchRuntime = ReturnType<typeof useWorkoutLaunch>
const Context = createContext<LaunchRuntime | null>(null)

export function LaunchRuntimeProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const value = useWorkoutLaunch(uid)
  const insets = useSafeAreaInsets()
  return <Context.Provider value={value}>{children}
    <Modal transparent animationType="fade" visible={!!value.confirmation} onRequestClose={value.cancelReplacement}>
      <View style={[styles.overlay, { paddingBottom: Math.max(24, insets.bottom) }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Keep current session" onPress={value.cancelReplacement} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.panel}>
          <Text accessibilityRole="header" style={styles.title}>Replace active session?</Text>
          <Text style={styles.copy}>Your current exercises and sets will be discarded. This cannot be undone.</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={value.cancelReplacement} style={styles.cancel}><Text style={styles.cancelText}>Keep current session</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => value.confirmation?.confirm()} style={styles.confirm}><Text style={styles.confirmText}>Start plan</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </Context.Provider>
}

export function useLaunchRuntime(): LaunchRuntime {
  const value = useContext(Context)
  if (!value) throw new Error('LaunchRuntimeProvider is missing.')
  return value
}

export function useOptionalLaunchRuntime(): LaunchRuntime | null { return useContext(Context) }

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 16, backgroundColor: 'rgba(8,7,9,0.76)' },
  panel: { width: '100%', maxWidth: 384, padding: 24, borderRadius: 14, backgroundColor: '#211f23', experimental_backgroundImage: 'linear-gradient(180deg, rgba(33,31,35,0.9), rgba(26,25,28,0.94))', borderWidth: 1, borderColor: 'rgba(244,241,242,0.2)' },
  title: { color: '#fff', fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16, lineHeight: 23, marginBottom: 8 },
  copy: { color: '#a09aa0', fontFamily: 'InstrumentSans_400Regular', fontSize: 14, lineHeight: 22, marginBottom: 24 },
  actions: { flexDirection: 'row', gap: 12 },
  cancel: { flex: 1, minHeight: 44, paddingVertical: 10, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(244,241,242,0.12)' },
  confirm: { flex: 1, minHeight: 44, paddingVertical: 10, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', borderRadius: 8, backgroundColor: '#a91f35', experimental_backgroundImage: 'linear-gradient(180deg, #c72e44, #a91f35)' },
  cancelText: { color: '#a09aa0', fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, textAlign: 'center' },
  confirmText: { color: '#fff', fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, textAlign: 'center' },
})
