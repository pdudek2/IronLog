import { useEffect, useRef, useState, type RefObject } from 'react'
import { Keyboard, TextInput, type ScrollView, type View } from 'react-native'

const MARGIN = 16

// Android 15+ draws edge to edge, so adjustResize no longer makes room for the keyboard and nothing scrolls the
// focused field into view. A browser does both: this returns the room to add below the content and scrolls the
// focused field just above the keyboard when the keyboard covers it.
export function useKeyboardReveal() {
  // ScrollView types innerViewRef as a non-null RefObject; it is filled once the content view mounts.
  const scroll = useRef<ScrollView>(null), content = useRef<View>(null) as RefObject<View>
  const [keyboard, setKeyboard] = useState<{ top: number; height: number } | null>(null)
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => setKeyboard({ top: event.endCoordinates.screenY, height: event.endCoordinates.height }))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(null))
    return () => { show.remove(); hide.remove() }
  }, [])
  useEffect(() => {
    if (!keyboard) return
    // After the render that added the room, so the target offset is reachable.
    const frame = requestAnimationFrame(() => {
      const view = scroll.current, frameRef = view?.getNativeScrollRef(), input = TextInput.State.currentlyFocusedInput()
      if (!view || !frameRef || !input || !content.current) return
      const inner = content.current
      input.measureInWindow((_x, inputTop, _width, height) => {
        if (inputTop + height + MARGIN <= keyboard.top) return
        frameRef.measureInWindow((_vx, viewTop) => input.measureLayout(inner, (_lx, contentTop) => {
          view.scrollTo({ y: contentTop + height + MARGIN - (keyboard.top - viewTop), animated: true })
        }))
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [keyboard])
  return { scroll, content, keyboardInset: keyboard?.height ?? 0 }
}
