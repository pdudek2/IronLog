// One command for a SHEAR release. Run it from main:
//   npm run release -- --testers a@example.com,b@example.com --notes "What changed"
// Add --dry-run to print the steps without running anything.
// The APK is built before the web goes live, so a failed build stops the whole release.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const FIREBASE_APP = '1:211359802307:android:9ce875f89a9b72f43ed376'
const FIREBASE_PROJECT = 'ironlog-ede05'
const JAVA_HOME = '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home'

interface ReleaseStep { name: string; cmd: string[]; cwd?: string; env?: Record<string, string> }
interface ReleaseInput { sha: string; versionCode: number; testers?: string; notes: string; worktree: string }

export function releaseSteps({ sha, versionCode, testers, notes, worktree }: ReleaseInput): ReleaseStep[] {
  const mobile = join(worktree, 'mobile')
  const apk = join(mobile, 'android/app/build/outputs/apk/release/app-release.apk')
  const android = { IRONLOG_MOBILE_BACKEND: 'production', IRONLOG_MOBILE_VERSION_CODE: String(versionCode) }
  const gradle = { ...android, JAVA_HOME, ANDROID_HOME: join(homedir(), 'Library/Android/sdk') }
  const firebase = ['npx', '-y', '-p', 'firebase-tools@15.34.2', 'firebase', 'appdistribution:distribute', apk, '--app', FIREBASE_APP, '--project', FIREBASE_PROJECT, '--release-notes', notes]
  return [
    { name: 'Web tests', cmd: ['npm', 'run', 'test:unit'] },
    { name: 'Web lint', cmd: ['npx', 'eslint', '.', '--ignore-pattern', '.claude/**'] },
    { name: 'Web build', cmd: ['npm', 'run', 'build'] },
    { name: 'Update the Android worktree', cwd: worktree, cmd: ['git', 'merge', '--ff-only', sha] },
    { name: 'Native tests', cwd: mobile, cmd: ['npm', 'test'] },
    { name: 'Native typecheck', cwd: mobile, cmd: ['npm', 'run', 'typecheck'] },
    { name: 'Android prebuild', cwd: mobile, env: android, cmd: ['npx', 'expo', 'prebuild', '--platform', 'android', '--clean', '--no-install'] },
    { name: 'Build the release APK', cwd: worktree, env: gradle, cmd: ['mobile/android/gradlew', '-p', 'mobile/android', ':app:assembleRelease', '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a'] },
    { name: 'Deploy the web', cmd: ['vercel', 'deploy', '--prod', '--yes'] },
    { name: 'Send the APK to testers', cmd: testers ? [...firebase, '--testers', testers] : firebase },
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
  const steps = releaseSteps({
    sha,
    // A commit count only grows, which is what Android needs from versionCode.
    versionCode: Number(git('rev-list', '--count', 'HEAD')),
    testers: option('--testers'),
    notes,
    worktree,
  })
  console.log(`Release ${sha.slice(0, 7)}: ${notes}`)
  if (dryRun) { for (const s of steps) console.log(`- ${s.name}: ${s.cmd.join(' ')}`); return }
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await prompt.question('This goes to production and to testers. Type "release" to continue: ')
  prompt.close()
  if (answer !== 'release') throw new Error('Stopped.')
  for (const s of steps) {
    console.log(`\n== ${s.name}`)
    execFileSync(s.cmd[0]!, s.cmd.slice(1), { cwd: s.cwd, stdio: 'inherit', env: { ...process.env, ...s.env } })
  }
  console.log(`\nReleased ${sha.slice(0, 7)}.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1) })
}
