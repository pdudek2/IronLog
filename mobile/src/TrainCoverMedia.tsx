import { useEventListener } from 'expo'
import { File, Paths } from 'expo-file-system'
import { useFocusEffect } from 'expo-router'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, AppState, Image, StyleSheet } from 'react-native'
import type { WorkoutCover } from '../../src/shared/workoutCover'
import { coverClips, covers, coverStarts } from './covers'

const playedFile = new File(Paths.document, 'train-cover-played.txt')
type TrainCover = WorkoutCover | 'week'

const playedToken = (cover: TrainCover) => `${new Date().toDateString()}:${cover}`

async function playedToday(cover: TrainCover) {
  try {
    return playedFile.exists && await playedFile.text() === playedToken(cover)
  } catch {
    return false
  }
}

function markPlayed(cover: TrainCover) {
  try {
    if (!playedFile.exists) playedFile.create()
    playedFile.write(playedToken(cover))
  } catch {
    // Without the file the clip simply plays again on the next visit.
  }
}

function CoverClip({ cover, onFail }: { cover: WorkoutCover, onFail: () => void }) {
  const loop = cover === 'upper'
  const player = useVideoPlayer(coverClips[cover], (created) => {
    created.muted = true
    created.audioMixingMode = 'mixWithOthers'
    created.loop = loop
  })
  const ended = useRef(false)
  const [framed, setFramed] = useState(false)

  useFocusEffect(useCallback(() => {
    const resume = () => { if (!ended.current) player.play() }
    resume()
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') resume() })
    return () => {
      subscription.remove()
      try {
        player.pause()
      } catch {
        // The player is already released when the screen unmounts.
      }
    }
  }, [player]))
  useEventListener(player, 'playToEnd', () => {
    ended.current = true
    markPlayed(cover)
  })
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') onFail()
  })

  return <>
    <Image accessibilityElementsHidden source={coverStarts[cover]} resizeMode="cover" style={styles.fill} />
    <VideoView
      accessibilityElementsHidden
      player={player}
      nativeControls={false}
      contentFit="cover"
      surfaceType="textureView"
      onFirstFrameRender={() => setFramed(true)}
      style={[styles.fill, { opacity: framed ? 1 : 0 }]}
    />
  </>
}

// The clip opens on its first frame and ends on the still, so nothing rewinds on screen.
export function TrainCoverMedia({ cover }: { cover: TrainCover }) {
  const [mode, setMode] = useState<'clip' | 'still' | null>(null)

  useEffect(() => {
    let mounted = true
    void Promise.all([AccessibilityInfo.isReduceMotionEnabled(), playedToday(cover)]).then(([reduced, played]) => {
      if (mounted) setMode(reduced || cover === 'week' || (played && cover !== 'upper') ? 'still' : 'clip')
    })
    return () => { mounted = false }
  }, [cover])

  if (mode === 'clip' && cover !== 'week') return <CoverClip cover={cover} onFail={() => setMode('still')} />
  if (mode === 'still') return <Image accessibilityElementsHidden source={covers[cover]} resizeMode="cover" style={styles.fill} />
  return null
}

const styles = StyleSheet.create({ fill: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' } })
