import { describe, expect, it } from 'vitest'
import { releaseSteps } from '../release'

const steps = releaseSteps({ sha: 'abc', versionCode: 900, testers: 'a@example.com', notes: 'Notes', worktree: '/wt' })
const at = (name: string) => steps.findIndex((s) => s.name === name)

describe('releaseSteps', () => {
  it('builds the APK before anything reaches production', () => {
    expect(at('Build the release APK')).toBeGreaterThan(at('Web tests'))
    expect(at('Build the release APK')).toBeLessThan(at('Deploy the web'))
    expect(at('Deploy the web')).toBeLessThan(at('Send the APK to testers'))
  })

  it('passes the version code and production backend to the Android build', () => {
    expect(steps[at('Android prebuild')].env).toMatchObject({ IRONLOG_MOBILE_BACKEND: 'production', IRONLOG_MOBILE_VERSION_CODE: '900' })
  })

  it('names testers only when given', () => {
    expect(steps.at(-1)?.cmd).toContain('--testers')
    const none = releaseSteps({ sha: 'abc', versionCode: 1, testers: undefined, notes: 'N', worktree: '/wt' })
    expect(none.at(-1)?.cmd).not.toContain('--testers')
  })
})
