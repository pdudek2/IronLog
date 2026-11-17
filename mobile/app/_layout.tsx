import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans'
import { useFonts } from 'expo-font'
import { SplashScreen, Stack, usePathname, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Keyboard, TextInput } from 'react-native'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ActiveRuntimeProvider, AuthRuntimeProvider, ClosureRuntimeProvider, useAuthRuntime } from '../src/runtime'
import { DialogHost } from '../src/dialog'
import { LaunchRuntimeProvider } from '../src/launchRuntime'
import { ReadinessRuntimeProvider } from '../src/readinessRuntime'

void SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  })

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync()
  }, [fontsLoaded])
  // Back hides the keyboard but leaves the field focused, so the next tap would place the caret instead of selecting all.
  useEffect(() => {
    const hidden = Keyboard.addListener('keyboardDidHide', () => TextInput.State.currentlyFocusedInput()?.blur())
    return () => hidden.remove()
  }, [])

  if (!fontsLoaded) return null

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
  const stack = <Stack screenOptions={{ headerShown: false }} />
  return (
    <ActiveRuntimeProvider key={user?.uid ?? 'signed-out'} uid={user?.uid ?? null}>
      {user ? <ClosureRuntimeProvider uid={user.uid}><LaunchRuntimeProvider uid={user.uid}><ReadinessRuntimeProvider uid={user.uid}>{stack}</ReadinessRuntimeProvider></LaunchRuntimeProvider></ClosureRuntimeProvider> : stack}
    </ActiveRuntimeProvider>
  )
}
