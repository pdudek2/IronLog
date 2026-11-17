// One command for a SHEAR release. Run it from main:
//   npm run release -- --testers a@example.com,b@example.com --notes "What changed"
// Add --dry-run to print the steps without running anything.
// Every test runs before anything reaches production, so any failure stops the whole release. Then the Android
// fingerprint picks the path: a JS-only change ships as an update after the web, a native change as a new APK.
// The emulator tests need ports 8080, 9099, 3000 and 5174 free: stop a local dev stack first.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const FIREBASE_APP = '1:211359802307:android:9ce875f89a9b72f43ed376'
const FIREBASE_PROJECT = 'ironlog-ede05'
const JAVA_HOME = '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home'
// The Firestore emulator of firebase-tools 15 needs Java 21 or newer; the Android build stays on 17.
const EMULATOR_JAVA = '/Library/Java/JavaVirtualMachines/temurin-25.jdk/Contents/Home'
const firebaseCli = ['npx', '-y', '-p', 'firebase-tools@15.34.2', 'firebase']
const easCli = ['npx', '-y', 'eas-cli@27.2.0']
const fingerprintCmd = ['npx', 'expo-updates', 'fingerprint:generate', '--platform', 'android']

type Env = Record<string, string | undefined>
interface ReleaseStep { name: string; cmd: string[]; cwd?: string; env?: Env; check?: (stdout: string) => void }
interface ReleaseInput { sha: string; versionCode: number; testers?: string; notes: string; worktree: string; fingerprint: string; nativeBuild: boolean }

// The fingerprint, the build and the update read the app config in this one environment, so their runtime versions agree.
export const mobileEnv: Env = { IRONLOG_MOBILE_BACKEND: 'production', IRONLOG_MOBILE_UPDATE_CHANNEL: 'production', IRONLOG_MOBILE_API_URL: undefined }

export const nativeTag = (fingerprint: string) => `native-${fingerprint}`
const UPDATE_STEP = 'Publish the Android update'

interface NativeTag { fingerprint: string; commit: string }

// lsRemote is the output of `git ls-remote --tags --refs origin 'native-*'`.
export function parseNativeTags(lsRemote: string): NativeTag[] {
  return lsRemote.split('\n').flatMap((line) => {
    const match = /^([0-9a-f]+)\s+refs\/tags\/native-(\S+)$/.exec(line.trim())
    return match ? [{ commit: match[1]!, fingerprint: match[2]! }] : []
  })
}

// Phones run the newest native build, so an older fingerprint coming back needs a build again.
export function needsNativeBuild(fingerprint: string, tags: NativeTag[], isAncestor: (ancestor: string, commit: string) => boolean): boolean {
  const own = tags.find((tag) => tag.fingerprint === fingerprint)
  return !own || tags.some((tag) => tag !== own && isAncestor(own.commit, tag.commit))
}

// A command to paste into any shell that repeats the step with its exact environment.
export function shellCommand({ cmd, cwd, env = {} }: ReleaseStep): string {
  const quote = (value: string) => /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`
  const unset = Object.keys(env).filter((key) => env[key] === undefined).map((key) => `-u ${key}`)
  const set = Object.entries(env).flatMap(([key, value]) => value === undefined ? [] : [`${key}=${quote(value)}`])
  const command = `env ${[...unset, ...set, ...cmd.map(quote)].join(' ')}`
  return cwd ? `cd ${quote(cwd)} && ${command}` : command
}

// apksigner is the output of `apksigner verify --print-certs`, keytool of `keytool -list -v` for the upload key.
export function assertUploadSigned(apksigner: string, keytool: string): void {
  if (apksigner.includes('CN=Android Debug')) throw new Error('The APK is signed with the Android debug key. Check SHEAR_UPLOAD_* in ~/.gradle/gradle.properties.')
  const upload = /SHA256: ([0-9A-F:]+)/.exec(keytool)?.[1]?.replaceAll(':', '').toLowerCase()
  if (!upload) throw new Error('Could not read the SHA-256 of the upload key.')
  const signers = [...apksigner.matchAll(/certificate SHA-256 digest: ([0-9a-f]+)/g)].map((match) => match[1])
  if (signers.length !== 1 || signers[0] !== upload) throw new Error('The APK is not signed with the SHEAR upload key.')
}

export function commonSteps({ sha, worktree }: { sha: string; worktree: string }): ReleaseStep[] {
  const mobile = join(worktree, 'mobile')
  // Same commands as the test:rules, test:integration:workout and test:e2e scripts, with the pinned CLI instead of a global one.
  const emulators = (only: string, command: string) => [...firebaseCli, 'emulators:exec', '--only', only, '--project', 'demo-ironlog', command]
  const java = { JAVA_HOME: EMULATOR_JAVA, PATH: `${EMULATOR_JAVA}/bin:${process.env.PATH ?? ''}` }
  const e2e = { ...java, E2E_BACKEND: 'emulator', TEST_EMAIL: 'e2e@ironlog.local', TEST_PASSWORD: 'ironlog-e2e' }
  return [
    { name: 'Web tests', cmd: ['npm', 'run', 'test:unit'] },
    { name: 'Web lint', cmd: ['npx', 'eslint', '.', '--ignore-pattern', '.claude/**'] },
    { name: 'Web build', cmd: ['npm', 'run', 'build'] },
    { name: 'Firestore rules tests', env: java, cmd: emulators('firestore', 'npx vitest run --config vitest.rules.config.ts') },
    { name: 'Workout integration tests', env: { ...java, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }, cmd: emulators('firestore', 'npx vitest run --config vitest.workout-integration.config.ts') },
    { name: 'Web e2e', env: e2e, cmd: emulators('auth,firestore', 'npx playwright test') },
    { name: 'Web e2e with CSP', env: { ...e2e, E2E_CSP: 'true' }, cmd: emulators('auth,firestore', 'npx playwright test tests/e2e/csp.spec.ts --project=desktop --retries=0') },
    { name: 'Update the Android worktree', cwd: worktree, cmd: ['git', 'merge', '--ff-only', sha] },
    { name: 'Install the native dependencies', cwd: mobile, cmd: ['npm', 'ci'] },
    { name: 'Native tests', cwd: mobile, cmd: ['npm', 'test'] },
    { name: 'Native typecheck', cwd: mobile, cmd: ['npm', 'run', 'typecheck'] },
    { name: 'Native lint', cwd: mobile, cmd: ['npm', 'run', 'lint'] },
  ]
}

export function releaseSteps({ sha, versionCode, testers, notes, worktree, fingerprint, nativeBuild }: ReleaseInput): ReleaseStep[] {
  const mobile = join(worktree, 'mobile')
  const runtime = { ...mobileEnv, IRONLOG_MOBILE_RUNTIME_VERSION: fingerprint }
  const commit = { EXPO_PUBLIC_COMMIT: sha.slice(0, 7) }
  const deploy: ReleaseStep[] = [
    { name: 'Deploy the Firestore rules and indexes', cmd: [...firebaseCli, 'deploy', '--only', 'firestore:rules,firestore:indexes', '--project', FIREBASE_PROJECT] },
    { name: 'Deploy the web', cmd: ['vercel', 'deploy', '--prod', '--yes'] },
  ]
  // The update goes out after the web, so new JS never calls an API that is not live yet.
  if (!nativeBuild) {
    return [...deploy, {
      name: UPDATE_STEP, cwd: mobile, env: { ...runtime, ...commit },
      cmd: [...easCli, 'update', '--channel', 'production', '--environment', 'production', '--platform', 'android', '--non-interactive', '--message', notes],
    }]
  }
  const apk = join(mobile, 'android/app/build/outputs/apk/release/app-release.apk')
  const android = { ...runtime, IRONLOG_MOBILE_VERSION_CODE: String(versionCode) }
  const gradle = { ...android, ...commit, JAVA_HOME, ANDROID_HOME: join(homedir(), 'Library/Android/sdk') }
  const firebase = [...firebaseCli, 'appdistribution:distribute', apk, '--app', FIREBASE_APP, '--project', FIREBASE_PROJECT, '--release-notes', notes]
  return [
    { name: 'Android prebuild', cwd: mobile, env: android, cmd: ['npx', 'expo', 'prebuild', '--platform', 'android', '--clean', '--no-install'] },
    { name: 'Build the release APK', cwd: worktree, env: gradle, cmd: ['mobile/android/gradlew', '-p', 'mobile/android', ':app:assembleRelease', '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a'] },
    {
      name: 'Check the APK signature', env: { JAVA_HOME, ANDROID_HOME: gradle.ANDROID_HOME, PATH: `${JAVA_HOME}/bin:${process.env.PATH ?? ''}` },
      cmd: ['sh', '-c', 'exec "$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)/apksigner" verify --print-certs "$0"', apk],
      check: (stdout) => assertUploadSigned(stdout, uploadKeyCertificate()),
    },
    ...deploy,
    { name: 'Send the APK to testers', cmd: testers ? [...firebase, '--testers', testers] : firebase },
    // Last, so a failed release leaves no tag and the next one builds the APK again. Forced, because a fingerprint that
    // comes back after another native build moves its tag to this newer build.
    { name: 'Tag the native build', cmd: ['git', 'push', '--force', 'origin', `${sha}:refs/tags/${nativeTag(fingerprint)}`] },
  ]
}

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()

// prebuild --clean wipes mobile/android, so the release config must live in mobile/config.
function checkAndroidWorktree(worktree: string) {
  if (git('-C', worktree, 'status', '--porcelain')) throw new Error(`Commit or clean the Android worktree first: ${worktree}`)
  const config = join(worktree, 'mobile/config/google-services.json')
  if (!existsSync(config) || !readFileSync(config, 'utf8').includes('"com.pdudek2.shear"')) {
    throw new Error(`Put the release google-services.json (com.pdudek2.shear) in ${config}.`)
  }
}
const option = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1] }
const show = (steps: ReleaseStep[]) => { for (const s of steps) console.log(`- ${s.name}: ${s.cmd.join(' ')}`) }
const run = (steps: ReleaseStep[]) => {
  for (const s of steps) {
    console.log(`\n== ${s.name}`)
    try {
      const stdout = execFileSync(s.cmd[0]!, s.cmd.slice(1), { cwd: s.cwd, stdio: ['inherit', s.check ? 'pipe' : 'inherit', 'inherit'], encoding: 'utf8', env: { ...process.env, ...s.env } })
      if (s.check) { process.stdout.write(stdout); s.check(stdout) }
    } catch (error) {
      if (s.name === UPDATE_STEP) console.error(`\nThe web is live, but the update did not publish. Retry it with:\n${shellCommand(s)}\n`)
      throw error
    }
  }
}

function uploadKeyCertificate(): string {
  const properties = Object.fromEntries(readFileSync(join(homedir(), '.gradle/gradle.properties'), 'utf8').split('\n')
    .flatMap((line) => { const match = /^\s*(SHEAR_UPLOAD_\w+)\s*=\s*(.*?)\s*$/.exec(line); return match ? [[match[1]!, match[2]!]] : [] }))
  const { SHEAR_UPLOAD_STORE_FILE: file, SHEAR_UPLOAD_KEY_ALIAS: alias, SHEAR_UPLOAD_STORE_PASSWORD: password } = properties
  if (!file || !alias || !password) throw new Error('Set SHEAR_UPLOAD_* in ~/.gradle/gradle.properties.')
  // The password goes through the environment, never the command line or the output.
  return execFileSync(join(JAVA_HOME, 'bin/keytool'), ['-list', '-v', '-keystore', file, '-alias', alias, '-storepass:env', 'SHEAR_STORE_PASSWORD'], { encoding: 'utf8', env: { ...process.env, SHEAR_STORE_PASSWORD: password } })
}

const isAncestor = (ancestor: string, commit: string) => {
  try { execFileSync('git', ['merge-base', '--is-ancestor', ancestor, commit]); return true } catch (error) {
    if ((error as { status?: number }).status === 1) return false
    throw error
  }
}

function nativeBuildNeeded(fingerprint: string): boolean {
  const tags = parseNativeTags(git('ls-remote', '--tags', '--refs', 'origin', 'native-*'))
  if (tags.length) git('fetch', '--no-tags', 'origin', ...tags.map((tag) => tag.commit))
  return needsNativeBuild(fingerprint, tags, isAncestor)
}

function androidFingerprint(mobile: string): string {
  // A string runtime version is left out of the hash; the placeholder only satisfies the app config.
  const env = { ...process.env, ...mobileEnv, IRONLOG_MOBILE_RUNTIME_VERSION: 'fingerprint' }
  const out = execFileSync(fingerprintCmd[0]!, fingerprintCmd.slice(1), { cwd: mobile, encoding: 'utf8', env })
  const { hash, sources } = JSON.parse(out) as { hash: string; sources: { id?: string }[] }
  // The fingerprint quietly leaves out an app config that throws, so its absence must stop the release.
  if (!sources.some((source) => source.id === 'expoConfig')) {
    throw new Error(`The Android app config did not load. See why: cd ${mobile} && IRONLOG_MOBILE_BACKEND=production IRONLOG_MOBILE_UPDATE_CHANNEL=production npx expo config`)
  }
  return hash
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const sha = git('rev-parse', 'HEAD')
  if (!dryRun) {
    if (git('branch', '--show-current') !== 'main') throw new Error('Release from main.')
    if (git('status', '--porcelain')) throw new Error('Commit or stash your changes first.')
    git('fetch', 'origin', 'main')
    if (sha !== git('rev-parse', 'origin/main')) throw new Error('main must match origin/main. Push or pull first.')
  }
  const notes = option('--notes') ?? git('log', '-1', '--format=%s')
  const worktree = process.env.SHEAR_ANDROID_WORKTREE ?? join(homedir(), '.codex/worktrees/e594/IronLog')
  checkAndroidWorktree(worktree)
  const input = {
    sha,
    // A commit count only grows, which is what Android needs from versionCode.
    versionCode: Number(git('rev-list', '--count', 'HEAD')),
    testers: option('--testers'),
    notes,
    worktree,
  }
  console.log(`Release ${sha.slice(0, 7)}: ${notes}`)
  if (dryRun) {
    show(commonSteps(input))
    console.log(`- Android fingerprint: ${fingerprintCmd.join(' ')}`)
    console.log(`\nWhen ${nativeTag('<fingerprint>')} is the newest native tag on origin (JS-only change):`)
    show(releaseSteps({ ...input, fingerprint: '<fingerprint>', nativeBuild: false }))
    console.log('\nOtherwise (native change):')
    show(releaseSteps({ ...input, fingerprint: '<fingerprint>', nativeBuild: true }))
    return
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await prompt.question('This goes to production and to testers. Type "release" to continue: ')
  prompt.close()
  if (answer !== 'release') throw new Error('Stopped.')
  run(commonSteps(input))
  // An ff-only merge into a worktree that is ahead of main reports success too.
  if (git('-C', worktree, 'rev-parse', 'HEAD') !== sha) throw new Error(`The Android worktree is not at ${sha}: ${worktree}`)
  const fingerprint = androidFingerprint(join(worktree, 'mobile'))
  const nativeBuild = nativeBuildNeeded(fingerprint)
  console.log(`\nAndroid fingerprint ${fingerprint}: ${nativeBuild ? 'native change, building the APK' : 'JS only, publishing an update'}.`)
  run(releaseSteps({ ...input, fingerprint, nativeBuild }))
  console.log(`\nReleased ${sha.slice(0, 7)}.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1) })
}
