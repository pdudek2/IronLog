import * as SplashScreen from 'expo-splash-screen'

void SplashScreen.preventAutoHideAsync()
SplashScreen.setOptions({ fade: true, duration: 200 })

let revealed = false
// The splash stays until the first screen knows what to show, or ~3 s at most; later calls do nothing.
export function revealApp() {
  if (revealed) return
  revealed = true
  void SplashScreen.hideAsync()
}
setTimeout(revealApp, 3_000)
