/// <reference lib="dom" />
// ^ `document` i `window` są używane tylko wewnątrz page.evaluate() callbacks,
//   które Playwright serializuje i wykonuje w kontekście przeglądarki.
import { chromium, devices, type Browser, type BrowserContext, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { guardQaCaptureContext, resolveQaCapture } from './qaSafety.js'

/**
 * Capture mockups using a seeded emulator account; active sessions are preserved.
 *
 * Prereq:
 *   Local Auth + Firestore emulators and the emulator-configured app on port 5174.
 *   E2E_BACKEND=emulator, both emulator hosts, TEST_EMAIL and TEST_PASSWORD are required.
 *   Seed the account/profile/data in the emulator before running `npm run mockups`.
 *
 * Output: ./mockups/{mobile,desktop}/<screen>.png
 */

const { baseUrl: BASE_URL, email: QA_EMAIL, password: QA_PASSWORD } = resolveQaCapture(
  process.env, process.env.MOCKUPS_URL,
)

interface Screen {
  name: string
  path: string
  waitMs: number
  // Override domyślnej wysokości viewport. Dla stron z długim content rozszerzamy
  // żeby pokazać hero + stats/filters + kilka itemów + nav, zamiast tylko hero lub
  // całego datasetu.
  mobileCapHeight?: number
  desktopCapHeight?: number
}

// Ekrany wymagające logowania. Kolejność pod readability outputu, nie pod flow.
const AUTH_SCREENS: Screen[] = [
  { name: 'dashboard', path: '/dashboard', waitMs: 3000, mobileCapHeight: 1300, desktopCapHeight: 1100 },
  { name: 'progress', path: '/progress', waitMs: 3500, mobileCapHeight: 1400, desktopCapHeight: 1300 },
  { name: 'history', path: '/history', waitMs: 2200, mobileCapHeight: 1200, desktopCapHeight: 1100 },
  { name: 'exercises', path: '/exercises', waitMs: 2000, mobileCapHeight: 1200, desktopCapHeight: 1100 },
  { name: 'templates', path: '/templates', waitMs: 2000 },
  { name: 'chat', path: '/chat', waitMs: 2000, mobileCapHeight: 1100, desktopCapHeight: 1400 },
  { name: 'profile', path: '/profile', waitMs: 2000, desktopCapHeight: 1000 },
  { name: 'workout-new', path: '/workout/new', waitMs: 2500, mobileCapHeight: 1000, desktopCapHeight: 1000 },
]

// iPhone 14 Pro screen size (pt) — realna wielkość telefonu. Playwright device preset daje
// 393×659 (viewport bez safe area + browser chrome), my chcemy pełny ekran aplikacji 393×852.
const MOBILE_VIEWPORT = { width: 393, height: 852 }
const DESKTOP_VIEWPORT = { width: 1440, height: 900 }

type ViewportSpec =
  | { name: 'mobile' }
  | { name: 'desktop' }

const VIEWPORTS: ViewportSpec[] = [{ name: 'mobile' }, { name: 'desktop' }]

const DISABLE_ANIMATIONS_CSS = `
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
  }
`

async function ensureOutputDir(): Promise<string> {
  const outDir = path.resolve(process.cwd(), 'mockups')
  await fs.rm(outDir, { recursive: true, force: true })
  await fs.mkdir(path.join(outDir, 'mobile'), { recursive: true })
  await fs.mkdir(path.join(outDir, 'desktop'), { recursive: true })
  return outDir
}

async function captureLoginPage(page: Page, outFile: string): Promise<void> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(900)
  await page.screenshot({ path: outFile, fullPage: false })
}

async function signInForCapture(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Email', { exact: true }).fill(QA_EMAIL)
  await page.getByLabel('Hasło', { exact: true }).fill(QA_PASSWORD)
  await page.getByRole('button', { name: 'Zaloguj się' }).click()
  await page.waitForURL(`${BASE_URL}/dashboard`, { timeout: 25_000 })
  // Firebase auth token persistence async flush
  await page.waitForTimeout(1500)
}

async function captureAuthScreen(
  page: Page,
  screen: Screen,
  outFile: string,
  viewportName: 'mobile' | 'desktop',
): Promise<void> {
  await page.goto(`${BASE_URL}${screen.path}`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(screen.waitMs)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(200)

  const baseViewport = viewportName === 'mobile' ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT
  const capHeight = viewportName === 'mobile' ? screen.mobileCapHeight : screen.desktopCapHeight

  if (capHeight && capHeight > baseViewport.height) {
    await page.setViewportSize({ width: baseViewport.width, height: capHeight })
    await page.waitForTimeout(350) // re-layout + fixed nav re-position
    await page.screenshot({ path: outFile, fullPage: false })
    await page.setViewportSize(baseViewport)
    return
  }

  await page.screenshot({ path: outFile, fullPage: false })
}

async function captureExerciseDetail(
  page: Page,
  outFile: string,
  viewportName: 'mobile' | 'desktop',
): Promise<void> {
  // Bench press jest w seedzie — zawsze istnieje jako global exercise z historią
  await page.goto(`${BASE_URL}/exercises/global/bench-press`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(2500)

  const base = viewportName === 'mobile' ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT
  const tallHeight = viewportName === 'mobile' ? 1400 : 1200

  // Tall viewport: hero + rekord + wykres wolumenu + 1-2 sesje
  await page.setViewportSize({ width: base.width, height: tallHeight })
  await page.waitForTimeout(350)
  await page.screenshot({ path: outFile, fullPage: false })
  await page.setViewportSize(base)
}

async function captureTemplateEditor(
  page: Page,
  outFile: string,
  viewportName: 'mobile' | 'desktop',
): Promise<void> {
  await page.goto(`${BASE_URL}/templates`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  // Przycisk "Edytuj szablon Upper / Lower 4×" ma aria-label pasujący do nazwy templateu z seeda
  const editButton = page.getByRole('button', { name: /Edytuj szablon Upper \/ Lower/i }).first()
  if ((await editButton.count()) === 0) {
    throw new Error('nie znaleziono przycisku edycji templateu "Upper / Lower 4×"')
  }
  await editButton.click()
  await page.waitForURL(/\/templates\/.+\/edit/, { timeout: 10_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(2200)

  const base = viewportName === 'mobile' ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT
  const tallHeight = viewportName === 'mobile' ? 1300 : 1100

  // Tall viewport: hero + tabs dni + 2-3 ćwiczenia z jednego dnia
  await page.setViewportSize({ width: base.width, height: tallHeight })
  await page.waitForTimeout(350)
  await page.screenshot({ path: outFile, fullPage: false })
  await page.setViewportSize(base)
}

async function newContext(browser: Browser, spec: ViewportSpec): Promise<BrowserContext> {
  if (spec.name === 'mobile') {
    // Device preset daje user-agent / hasTouch / isMobile — ale viewport override'ujemy
    // na realny rozmiar ekranu iPhone 14 Pro (393×852 pt).
    return browser.newContext({
      ...devices['iPhone 14 Pro'],
      serviceWorkers: 'block',
      viewport: MOBILE_VIEWPORT,
      deviceScaleFactor: 3,
    })
  }
  return browser.newContext({ viewport: DESKTOP_VIEWPORT, deviceScaleFactor: 2, serviceWorkers: 'block' })
}

async function captureViewport(
  browser: Browser,
  spec: ViewportSpec,
  outDir: string,
): Promise<void> {
  const dims = spec.name === 'mobile' ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT
  console.log(`\n📸 ${spec.name} (${dims.width}×${dims.height})`)

  const context = await newContext(browser, spec)
  await guardQaCaptureContext(context, BASE_URL)
  await context.addInitScript(() => {
    // Opcja bezpieczeństwa: po załadowaniu strony disable animacji
    const style = document.createElement('style')
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        transition-duration: 0.001ms !important;
      }
    `
    if (document.head) document.head.appendChild(style)
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style))
  })

  const page = await context.newPage()
  await page.addStyleTag({ content: DISABLE_ANIMATIONS_CSS }).catch(() => {})

  const viewportDir = path.join(outDir, spec.name)

  // 1. Login (niezalogowany)
  await captureLoginPage(page, path.join(viewportDir, 'login.png'))
  console.log(`   ✓ login`)

  // 2. Authenticate
  await signInForCapture(page)

  // 3. Authed screens (standard list)
  for (const screen of AUTH_SCREENS) {
    try {
      await captureAuthScreen(page, screen, path.join(viewportDir, `${screen.name}.png`), spec.name)
      console.log(`   ✓ ${screen.name}`)
    } catch (err) {
      console.log(`   ✗ ${screen.name}: ${(err as Error).message}`)
      process.exitCode = 1
    }
  }

  // 4. Nawigacyjne — exercise detail, template editor
  try {
    await captureExerciseDetail(page, path.join(viewportDir, 'exercise-detail.png'), spec.name)
    console.log(`   ✓ exercise-detail`)
  } catch (err) {
    console.log(`   ✗ exercise-detail: ${(err as Error).message}`)
    process.exitCode = 1
  }
  try {
    await captureTemplateEditor(page, path.join(viewportDir, 'template-editor.png'), spec.name)
    console.log(`   ✓ template-editor`)
  } catch (err) {
    console.log(`   ✗ template-editor: ${(err as Error).message}`)
    process.exitCode = 1
  }

  await context.close()
}

async function verifyDevServer(): Promise<void> {
  try {
    const response = await fetch(BASE_URL)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
  } catch (err) {
    console.error(
      `\n❌ Nie mogę połączyć się z ${BASE_URL}.\n` +
      `   W drugim terminalu odpal \`npm run dev\` i spróbuj ponownie.\n` +
      `   (${(err as Error).message})`,
    )
    process.exit(1)
  }
}

async function main(): Promise<void> {
  console.log(`\n🎬 IronLog mockup capture`)
  console.log(`   URL: ${BASE_URL}`)
  console.log(`   Konto: ${QA_EMAIL}`)

  await verifyDevServer()
  const outDir = await ensureOutputDir()

  const browser = await chromium.launch({ headless: true })

  try {
    for (const vp of VIEWPORTS) {
      await captureViewport(browser, vp, outDir)
    }
  } finally {
    await browser.close()
  }

  console.log(`\nCapture zakończony. Mockupy w ${path.relative(process.cwd(), outDir)}/`)
  console.log(`   Tip: owiń wybrane w ramki na shots.so lub mockuphone.com\n`)
}

main().catch((err) => {
  console.error('\n❌ Capture failed:', err)
  process.exit(1)
})
