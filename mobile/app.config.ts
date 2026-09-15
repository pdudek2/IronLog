import type { ExpoConfig } from 'expo/config'

const backend = process.env.IRONLOG_MOBILE_BACKEND

if (backend !== 'emulator' && backend !== 'production') {
  throw new Error('Set IRONLOG_MOBILE_BACKEND to emulator or production before running Expo.')
}

const emulatorHost = process.env.IRONLOG_MOBILE_FIREBASE_HOST
if (backend === 'emulator' && !emulatorHost) {
  throw new Error('Set IRONLOG_MOBILE_FIREBASE_HOST for an emulator build.')
}

const config: ExpoConfig = {
  name: 'IronLog Dev',
  slug: 'ironlog-mobile',
  scheme: 'ironlog-dev',
  version: '0.1.0',
  orientation: 'portrait',
  newArchEnabled: true,
  plugins: [
    'expo-router',
    'expo-font',
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
  ],
  experiments: {
    typedRoutes: true,
  },
  android: {
    package: 'com.pdudek2.ironlog.dev',
    googleServicesFile: process.env.IRONLOG_GOOGLE_SERVICES_FILE ?? './config/google-services.json',
  },
  extra: {
    firebaseBackend: backend,
    firebaseEmulatorHost: emulatorHost ?? null,
  },
}

export default config
