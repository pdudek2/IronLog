import { Archivo_700Bold, Archivo_800ExtraBold } from '@expo-google-fonts/archivo'
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans'
import { SplineSansMono_600SemiBold } from '@expo-google-fonts/spline-sans-mono'
import { useFonts } from 'expo-font'
import { SplashScreen, Stack, usePathname, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import ArchivoHero from '../assets/fonts/ArchivoHero.ttf'
import ArchivoHeading from '../assets/fonts/ArchivoHeading.ttf'
import { ActiveRuntimeProvider, AuthRuntimeProvider, ClosureRuntimeProvider, useAuthRuntime } from '../src/runtime'

void SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ArchivoHero,
    ArchivoHeading,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
    SplineSansMono_600SemiBold,
  })

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync()
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  return (
    <SafeAreaProvider>
      <AuthRuntimeProvider>
        <RootStack />
      </AuthRuntimeProvider>
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
      {user ? <ClosureRuntimeProvider uid={user.uid}>{stack}</ClosureRuntimeProvider> : stack}
    </ActiveRuntimeProvider>
  )
}
