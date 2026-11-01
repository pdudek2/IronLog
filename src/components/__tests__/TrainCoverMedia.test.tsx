import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TrainCoverMedia } from '../TrainCoverMedia'

const motion = vi.hoisted(() => ({ reduced: false }))

vi.mock('framer-motion', async (importOriginal) => ({
  ...await importOriginal<typeof import('framer-motion')>(),
  useReducedMotion: () => motion.reduced,
}))

describe('TrainCoverMedia', () => {
  const play = vi.fn<() => Promise<void>>()

  beforeEach(() => {
    localStorage.clear()
    motion.reduced = false
    play.mockReset().mockResolvedValue()
    HTMLMediaElement.prototype.play = play
  })

  it('opens on the first frame of the clip and plays once it can', () => {
    const { container } = render(<TrainCoverMedia cover="push" />)
    const video = container.querySelector('video')!

    expect(video.getAttribute('poster')).toBe('/covers/push-start.jpg')
    expect(container.querySelector('img')).toBeNull()
    fireEvent.canPlay(video)
    expect(play).toHaveBeenCalledOnce()
  })

  it('shows the still for the rest of the day after the clip ended', () => {
    const first = render(<TrainCoverMedia cover="push" />)
    fireEvent.ended(first.container.querySelector('video')!)
    first.unmount()

    expect(render(<TrainCoverMedia cover="push" />).container.querySelector('img')?.getAttribute('src')).toBe('/covers/push.jpg')
    expect(render(<TrainCoverMedia cover="pull" />).container.querySelector('video')).not.toBeNull()
  })

  it('replays when the clip was left before its end', () => {
    render(<TrainCoverMedia cover="push" />).unmount()

    expect(render(<TrainCoverMedia cover="push" />).container.querySelector('video')).not.toBeNull()
  })

  it('keeps looping on later visits', () => {
    const first = render(<TrainCoverMedia cover="upper" />)
    expect(first.container.querySelector('video')?.loop).toBe(true)
    fireEvent.ended(first.container.querySelector('video')!)
    first.unmount()

    expect(render(<TrainCoverMedia cover="upper" />).container.querySelector('video')).not.toBeNull()
  })

  it('shows the still under reduced motion', () => {
    motion.reduced = true
    const { container } = render(<TrainCoverMedia cover="upper" />)

    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/covers/upper.jpg')
  })

  it('falls back to the still when the clip cannot load or autoplay is blocked', async () => {
    const failed = render(<TrainCoverMedia cover="push" />)
    fireEvent.error(failed.container.querySelector('video')!)
    expect(failed.container.querySelector('img')).not.toBeNull()
    failed.unmount()

    play.mockRejectedValue(new Error('NotAllowedError'))
    const blocked = render(<TrainCoverMedia cover="push" />)
    fireEvent.canPlay(blocked.container.querySelector('video')!)
    await vi.waitFor(() => expect(blocked.container.querySelector('img')).not.toBeNull())
  })
})
