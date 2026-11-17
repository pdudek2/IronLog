import { describe, expect, it } from 'vitest'
import { commonSteps, needsNativeBuild, releaseSteps } from '../release'

const input = { sha: 'abc1234def', versionCode: 900, testers: 'a@example.com', notes: 'Notes', worktree: '/wt', fingerprint: 'fp1' }
const common = commonSteps(input)
const build = [...common, ...releaseSteps({ ...input, nativeBuild: true })]
const update = [...common, ...releaseSteps({ ...input, nativeBuild: false })]
const at = (steps: typeof build, name: string) => steps.findIndex((s) => s.name === name)
const step = (steps: typeof build, name: string) => steps[at(steps, name)]
const production = { IRONLOG_MOBILE_BACKEND: 'production', IRONLOG_MOBILE_UPDATE_CHANNEL: 'production', IRONLOG_MOBILE_RUNTIME_VERSION: 'fp1' }

describe('releaseSteps', () => {
  it('runs the rules, integration and e2e tests on the emulators before the APK build', () => {
    for (const name of ['Firestore rules tests', 'Workout integration tests', 'Web e2e', 'Web e2e with CSP', 'Native lint']) {
      expect(at(build, name)).toBeGreaterThan(-1)
      expect(at(build, name)).toBeLessThan(at(build, 'Build the release APK'))
    }
    for (const name of ['Firestore rules tests', 'Workout integration tests', 'Web e2e', 'Web e2e with CSP']) {
      expect(step(build, name).cmd).toEqual(expect.arrayContaining(['emulators:exec', '--project', 'demo-ironlog']))
      expect(step(build, name).cmd).not.toContain('ironlog-ede05')
    }
    expect(step(build, 'Workout integration tests').env).toMatchObject({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })
    expect(step(build, 'Web e2e with CSP').env).toMatchObject({ E2E_BACKEND: 'emulator', E2E_CSP: 'true' })
  })

  it('installs the native dependencies in the worktree before the native tests', () => {
    expect(step(common, 'Install the native dependencies')).toMatchObject({ cwd: '/wt/mobile', cmd: ['npm', 'ci'] })
    expect(at(common, 'Install the native dependencies')).toBeGreaterThan(at(common, 'Update the Android worktree'))
    expect(at(common, 'Install the native dependencies')).toBeLessThan(at(common, 'Native tests'))
  })

  it('builds the APK before anything reaches production', () => {
    expect(at(build, 'Build the release APK')).toBeGreaterThan(at(build, 'Web tests'))
    expect(at(build, 'Build the release APK')).toBeLessThan(at(build, 'Deploy the web'))
    expect(at(build, 'Deploy the web')).toBeLessThan(at(build, 'Send the APK to testers'))
  })

  it('deploys the rules after the APK build and before the web', () => {
    expect(at(build, 'Deploy the Firestore rules and indexes')).toBeGreaterThan(at(build, 'Build the release APK'))
    expect(at(build, 'Deploy the Firestore rules and indexes')).toBeLessThan(at(build, 'Deploy the web'))
    expect(step(build, 'Deploy the Firestore rules and indexes').cmd).toEqual(expect.arrayContaining(['deploy', '--only', 'firestore:rules,firestore:indexes', '--project', 'ironlog-ede05']))
  })

  it('builds with the shared production environment, version code, runtime version and commit', () => {
    expect(step(build, 'Android prebuild').env).toMatchObject({ ...production, IRONLOG_MOBILE_VERSION_CODE: '900' })
    expect(step(build, 'Build the release APK').env).toMatchObject({ ...production, IRONLOG_MOBILE_VERSION_CODE: '900', EXPO_PUBLIC_COMMIT: 'abc1234' })
    expect(step(build, 'Android prebuild').env).toHaveProperty('IRONLOG_MOBILE_API_URL', undefined)
  })

  it('tags the native build last and publishes no update', () => {
    expect(build.at(-1)).toMatchObject({ name: 'Tag the native build', cmd: ['git', 'push', 'origin', 'abc1234def:refs/tags/native-fp1'] })
    expect(build.some((s) => s.cmd.includes('update'))).toBe(false)
  })

  it('publishes a JS-only change as a production update after the web, without an APK', () => {
    const ota = update.at(-1)!
    expect(ota.name).toBe('Publish the Android update')
    expect(ota.cmd).toEqual(expect.arrayContaining(['update', '--channel', 'production', '--environment', 'production', '--platform', 'android', '--non-interactive', '--message', 'Notes']))
    expect(ota).toMatchObject({ cwd: '/wt/mobile', env: { ...production, EXPO_PUBLIC_COMMIT: 'abc1234' } })
    expect(ota.env).toHaveProperty('IRONLOG_MOBILE_API_URL', undefined)
    expect(at(update, 'Deploy the web')).toBeGreaterThan(at(update, 'Deploy the Firestore rules and indexes'))
    expect(at(update, 'Deploy the web')).toBeLessThan(update.length - 1)
    for (const name of ['Android prebuild', 'Build the release APK', 'Send the APK to testers', 'Tag the native build']) expect(at(update, name)).toBe(-1)
  })

  it('names testers only when given', () => {
    expect(step(build, 'Send the APK to testers').cmd).toContain('--testers')
    const none = releaseSteps({ ...input, testers: undefined, nativeBuild: true })
    expect(step(none, 'Send the APK to testers').cmd).not.toContain('--testers')
  })
})

describe('needsNativeBuild', () => {
  const tags = 'aaa\trefs/tags/native-fp1\nbbb\trefs/tags/native-fp12\n'
  it('ships an update only when origin has the tag for this exact fingerprint', () => {
    expect(needsNativeBuild('fp1', tags)).toBe(false)
    expect(needsNativeBuild('fp', tags)).toBe(true)
    expect(needsNativeBuild('fp2', tags)).toBe(true)
    expect(needsNativeBuild('fp1', '')).toBe(true)
  })
})
