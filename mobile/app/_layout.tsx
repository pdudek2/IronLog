import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans'
import { useFonts } from 'expo-font'
import { Stack, usePathname, useRouter, type ErrorBoundaryProps } from 'expo-router'
import { useEffect } from 'react'
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ActiveRuntimeProvider, AuthRuntimeProvider, ClosureRuntimeProvider, useAuthRuntime } from '../src/runtime'
import { DialogHost } from '../src/dialog'
import { LaunchRuntimeProvider } from '../src/launchRuntime'
import { ReadinessRuntimeProvider } from '../src/readinessRuntime'
import '../src/splash'
import { colors, pageTitle } from '../src/theme'
import { forgetReads } from '../src/scopedRead'

// A render error shows a way back instead of a blank screen.
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: 24, gap: 12 }}>
    <Text accessibilityRole="header" style={pageTitle}>Something went wrong</Text>
    <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 21 }}>Try again to reload the screen.</Text>
    <Pressable accessibilityRole="button" onPress={() => { void retry() }} style={({ pressed }) => ({ marginTop: 8, height: 52, borderRadius: 10, backgroundColor: colors.primaryStart, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
      <Text style={{ color: colors.onPrimary, fontSize: 16, fontFamily: 'InstrumentSans_600SemiBold' }}>Try again</Text>
    </Pressable>
  </View>
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  })

  // Back hides the keyboard but leaves the field focused, so the next tap would place the caret instead of selecting all.
  useEffect(() => {
    const hidden = Keyboard.addListener('keyboardDidHide', () => TextInput.State.currentlyFocusedInput()?.blur())
    return () => hidden.remove()
  }, [])

  // A font that fails to load falls back to the system font instead of holding the app on the splash.
  if (!fontsLoaded && !fontError) return null

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <AuthRuntimeProvider>
          <RootStack />
          <DialogHost />
        </AuthRuntimeProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  )
}

function RootStack() {
  const { user } = useAuthRuntime()
  const pathname = usePathname()
  const router = useRouter()
  useEffect(() => {
    if (user === null && pathname !== '/') router.replace('/')
  }, [pathname, router, user])
  const uid = user?.uid
  useEffect(() => { forgetReads() }, [uid])
  const stack = <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
  return (
    <ActiveRuntimeProvider key={user?.uid ?? 'signed-out'} uid={user?.uid ?? null}>
      {user ? <ClosureRuntimeProvider uid={user.uid}><LaunchRuntimeProvider uid={user.uid}><ReadinessRuntimeProvider uid={user.uid}>{stack}</ReadinessRuntimeProvider></LaunchRuntimeProvider></ClosureRuntimeProvider> : stack}
    </ActiveRuntimeProvider>
  )
}
