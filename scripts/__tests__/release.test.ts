import { describe, expect, it } from 'vitest'
import { releaseSteps } from '../release'

const steps = releaseSteps({ sha: 'abc', versionCode: 900, testers: 'a@example.com', notes: 'Notes', worktree: '/wt' })
const at = (name: string) => steps.findIndex((s) => s.name === name)

describe('releaseSteps', () => {
  it('runs the rules, integration and e2e tests on the emulators before the APK build', () => {
    for (const name of ['Firestore rules tests', 'Workout integration tests', 'Web e2e', 'Web e2e with CSP', 'Native lint']) {
      expect(at(name)).toBeGreaterThan(-1)
      expect(at(name)).toBeLessThan(at('Build the release APK'))
    }
    for (const name of ['Firestore rules tests', 'Workout integration tests', 'Web e2e', 'Web e2e with CSP']) {
      expect(steps[at(name)].cmd).toEqual(expect.arrayContaining(['emulators:exec', '--project', 'demo-ironlog']))
      expect(steps[at(name)].cmd).not.toContain('ironlog-ede05')
    }
    expect(steps[at('Workout integration tests')].env).toMatchObject({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })
    expect(steps[at('Web e2e with CSP')].env).toMatchObject({ E2E_BACKEND: 'emulator', E2E_CSP: 'true' })
  })

  it('builds the APK before anything reaches production', () => {
    expect(at('Build the release APK')).toBeGreaterThan(at('Web tests'))
    expect(at('Build the release APK')).toBeLessThan(at('Deploy the web'))
    expect(at('Deploy the web')).toBeLessThan(at('Send the APK to testers'))
  })

  it('deploys the rules after the APK build and before the web', () => {
    expect(at('Deploy the Firestore rules')).toBeGreaterThan(at('Build the release APK'))
    expect(at('Deploy the Firestore rules')).toBeLessThan(at('Deploy the web'))
    expect(steps[at('Deploy the Firestore rules')].cmd).toEqual(expect.arrayContaining(['deploy', '--only', 'firestore:rules', '--project', 'ironlog-ede05']))
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
