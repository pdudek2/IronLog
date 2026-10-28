import type { ExpoConfig } from 'expo/config'
import { withAndroidManifest, withAppBuildGradle, type ConfigPlugin } from 'expo/config-plugins'

const backend = process.env.IRONLOG_MOBILE_BACKEND

if (backend !== 'emulator' && backend !== 'production') {
  throw new Error('Set IRONLOG_MOBILE_BACKEND to emulator or production before running Expo.')
}

const emulatorHost = process.env.IRONLOG_MOBILE_FIREBASE_HOST
if (backend === 'emulator' && !emulatorHost) {
  throw new Error('Set IRONLOG_MOBILE_FIREBASE_HOST for an emulator build.')
}

// Emulator builds call the local dev API over plain HTTP; production builds keep Android's cleartext block.
const allowEmulatorCleartext: ConfigPlugin = (expoConfig) => withAndroidManifest(expoConfig, (next) => {
  next.modResults.manifest.application![0]!.$['android:usesCleartextTraffic'] = 'true'
  return next
})

// Production release builds sign with the SHEAR upload key from ~/.gradle/gradle.properties when it is present;
// without it (or for emulator builds, which must keep updating the installed dev app) they keep the template's debug key.
const signWithUploadKey: ConfigPlugin = (expoConfig) => withAppBuildGradle(expoConfig, (next) => {
  const replace = (from: string, to: string) => {
    if (!next.modResults.contents.includes(from)) throw new Error(`Release signing: the app build.gradle no longer contains ${JSON.stringify(from)}.`)
    next.modResults.contents = next.modResults.contents.replace(from, to)
  }
  replace(
    "            keyPassword 'android'\n        }\n",
    "            keyPassword 'android'\n        }\n"
      + "        if (project.hasProperty('SHEAR_UPLOAD_STORE_FILE')) {\n"
      + '            release {\n'
      + '                storeFile file(SHEAR_UPLOAD_STORE_FILE)\n'
      + '                storePassword SHEAR_UPLOAD_STORE_PASSWORD\n'
      + '                keyAlias SHEAR_UPLOAD_KEY_ALIAS\n'
      + '                keyPassword SHEAR_UPLOAD_KEY_PASSWORD\n'
      + '            }\n'
      + '        }\n',
  )
  replace(
    '            // see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug\n',
    "            // see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig project.hasProperty('SHEAR_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug\n",
  )
  return next
})

const production = backend === 'production'

const apiBaseUrl = process.env.IRONLOG_MOBILE_API_URL
  ?? (backend === 'emulator' ? `http://${emulatorHost}:3000` : 'https://getshear.vercel.app')

const config: ExpoConfig = {
  name: production ? 'SHEAR' : 'SHEAR Dev',
  slug: 'ironlog-mobile',
  scheme: production ? 'shear' : 'ironlog-dev',
  version: '0.1.0',
  orientation: 'portrait',
  // Rendered from public/app-icon-source.svg by scripts/render-icons.mjs.
  icon: './assets/icon.png',
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
  ],
  experiments: {
    typedRoutes: true,
  },
  android: {
    // The dev app keeps its id so the installed emulator build still updates beside the release app.
    package: production ? 'com.pdudek2.shear' : 'com.pdudek2.ironlog.dev',
    versionCode: 1,
    googleServicesFile: process.env.IRONLOG_GOOGLE_SERVICES_FILE ?? './config/google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon-foreground.png',
      backgroundImage: './assets/adaptive-icon-background.png',
    },
  },
  extra: {
    firebaseBackend: backend,
    firebaseEmulatorHost: emulatorHost ?? null,
    apiBaseUrl,
  },
}

export default backend === 'emulator' ? allowEmulatorCleartext(config) : signWithUploadKey(config)
