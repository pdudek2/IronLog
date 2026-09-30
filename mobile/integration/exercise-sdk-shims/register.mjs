// Run the actual native adapter in Node with Firebase's modular emulator transport.
// Android runtime checks separately exercise RNFirebase and Expo Crypto in the installed APK.
import { registerHooks } from 'node:module'
registerHooks({ resolve(specifier, context, next) {
  const modules = { '@react-native-firebase/app': 'firebase/app', '@react-native-firebase/auth': 'firebase/auth', '@react-native-firebase/firestore': 'firebase/firestore' }
  if (modules[specifier]) return next(modules[specifier], context)
  if (specifier === 'expo-constants') return { url: new URL('./constants.mjs', import.meta.url).href, shortCircuit: true }
  if (specifier === 'expo-crypto') return { url: new URL('./crypto.mjs', import.meta.url).href, shortCircuit: true }
  return next(specifier, context)
} })
