import { describe, expect, it } from 'vitest'
import { assertUploadSigned, commonSteps, needsNativeBuild, parseNativeTags, releaseSteps, shellCommand } from '../release'

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

  it('checks the APK signature right after the build', () => {
    expect(at(build, 'Check the APK signature')).toBe(at(build, 'Build the release APK') + 1)
    expect(step(build, 'Check the APK signature').cmd).toContain('/wt/mobile/android/app/build/outputs/apk/release/app-release.apk')
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
    expect(build.at(-1)).toMatchObject({ name: 'Tag the native build', cmd: ['git', 'push', '--force', 'origin', 'abc1234def:refs/tags/native-fp1'] })
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
  // A straight history: c1 < c2 < c3.
  const history = ['c1', 'c2', 'c3']
  const isAncestor = (ancestor: string, commit: string) => history.indexOf(ancestor) <= history.indexOf(commit)
  const tags = parseNativeTags('c1\trefs/tags/native-fp1\nc2\trefs/tags/native-fp12\n')

  it('reads the fingerprint and commit of every native tag', () => {
    expect(tags).toEqual([{ commit: 'c1', fingerprint: 'fp1' }, { commit: 'c2', fingerprint: 'fp12' }])
  })

  it('ships an update only for the newest native build', () => {
    expect(needsNativeBuild('fp12', tags, isAncestor)).toBe(false)
    expect(needsNativeBuild('fp', tags, isAncestor)).toBe(true)
    expect(needsNativeBuild('fp1', [], isAncestor)).toBe(true)
  })

  it('builds again when a fingerprint comes back after another native build', () => {
    expect(needsNativeBuild('fp1', tags, isAncestor)).toBe(true)
    // After that build the fp1 tag moves to c3, so the next JS-only change is an update again.
    expect(needsNativeBuild('fp1', parseNativeTags('c3\trefs/tags/native-fp1\nc2\trefs/tags/native-fp12'), isAncestor)).toBe(false)
  })
})

describe('shellCommand', () => {
  it('repeats the update with its exact environment and an unset API URL', () => {
    const ota = releaseSteps({ ...input, notes: "Coach's fix", nativeBuild: false }).at(-1)!
    expect(shellCommand(ota)).toBe(
      "cd /wt/mobile && env -u IRONLOG_MOBILE_API_URL IRONLOG_MOBILE_BACKEND=production IRONLOG_MOBILE_UPDATE_CHANNEL=production"
      + " IRONLOG_MOBILE_RUNTIME_VERSION=fp1 EXPO_PUBLIC_COMMIT=abc1234 npx -y eas-cli@27.2.0 update --channel production"
      + " --environment production --platform android --non-interactive --message 'Coach'\\''s fix'",
    )
  })
})

describe('assertUploadSigned', () => {
  const keytool = 'Alias name: shear-upload\n\t SHA256: 8C:4B:89:32\n'
  const signed = (dn: string, digest: string) => `Signer #1 certificate DN: ${dn}\nSigner #1 certificate SHA-256 digest: ${digest}\n`

  it('accepts only the upload key', () => {
    expect(() => assertUploadSigned(signed('CN=Patryk Dudek, O=SHEAR', '8c4b8932'), keytool)).not.toThrow()
    expect(() => assertUploadSigned(signed('CN=Android Debug, OU=Android', 'fac61745'), keytool)).toThrow(/debug key/)
    expect(() => assertUploadSigned(signed('CN=Someone', 'deadbeef'), keytool)).toThrow(/not signed with the SHEAR upload key/)
    expect(() => assertUploadSigned(signed('CN=Patryk Dudek, O=SHEAR', '8c4b8932'), 'no certificate')).toThrow(/upload key/)
  })
})
