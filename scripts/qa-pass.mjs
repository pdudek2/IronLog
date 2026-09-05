// Comprehensive QA pass: navigate the app like a real user, capture screenshots,
// log all errors (page errors, console errors, failed network requests).
// Run from project root with dev server already running:
//   node --import tsx scripts/qa-pass.mjs
import { chromium, devices } from '@playwright/test'
import fs from 'node:fs/promises'
import { guardQaCaptureContext, resolveQaCapture } from './qaSafety.ts'

// Requires the local emulator hosts and a seeded TEST_EMAIL / TEST_PASSWORD account.
const { baseUrl: BASE, email: QA_EMAIL, password: QA_PASSWORD } = resolveQaCapture(
  process.env, process.env.QA_URL,
)
const OUT = '/tmp/ironlog-qa-pass'
await fs.rm(OUT, { recursive: true, force: true })
await fs.mkdir(OUT, { recursive: true })

const errors = []
const consoleErrors = []
const failedRequests = []

function attachListeners(page, viewport) {
  page.on('pageerror', (err) => {
    errors.push({ viewport, url: page.url(), error: err.message, stack: err.stack?.split('\n').slice(0, 4).join(' | ') })
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ viewport, url: page.url(), text: msg.text().slice(0, 300) })
    }
  })
  page.on('requestfailed', (req) => {
    const failure = req.failure()?.errorText
    if (failure && !failure.includes('ABORTED')) {
      failedRequests.push({ viewport, url: req.url().slice(0, 150), method: req.method(), failure })
    }
  })
}

async function shoot(page, name, opts = {}) {
  const path = `${OUT}/${name}.png`
  await page.screenshot({ path, fullPage: opts.fullPage ?? false })
  console.log(`   📸 ${name}`)
}

async function login(page, badPasswordFirst = false) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  if (badPasswordFirst) {
    await page.getByLabel('Email', { exact: true }).fill(QA_EMAIL)
    await page.getByLabel('Hasło', { exact: true }).fill('wrong-password')
    await page.getByRole('button', { name: 'Zaloguj się' }).click()
    await page.waitForTimeout(2500)
    await shoot(page, '01-login-wrong-password')
    // Clear and re-fill
    await page.getByLabel('Hasło', { exact: true }).fill('')
  } else {
    await page.getByLabel('Email', { exact: true }).fill(QA_EMAIL)
  }

  await page.getByLabel('Hasło', { exact: true }).fill(QA_PASSWORD)
  await page.getByRole('button', { name: 'Zaloguj się' }).click()
  await page.waitForURL(`${BASE}/dashboard`, { timeout: 25_000 })
  await page.waitForTimeout(1500)
}

async function flowDashboard(page) {
  console.log('\n🏠 Dashboard')
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await shoot(page, '02-dashboard')

  // Scroll to bottom to see all sections
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(800)
  await shoot(page, '03-dashboard-scrolled')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)
}

async function flowHistory(page) {
  console.log('\n📜 History')
  await page.goto(`${BASE}/history`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await shoot(page, '04-history-default')

  // Search box
  const searchInput = page.locator('input[type="search"], input[placeholder*="zukaj" i], input[placeholder*="wyszuk" i]').first()
  if ((await searchInput.count()) > 0) {
    await searchInput.fill('deadlift')
    await page.waitForTimeout(800)
    await shoot(page, '05-history-search-deadlift')
    await searchInput.fill('')
    await page.waitForTimeout(400)
  } else {
    console.log('   ⚠️ search input not found')
  }

  // Date range chip - click "30 dni"
  const range30 = page.getByRole('button', { name: /30/i }).first()
  if ((await range30.count()) > 0) {
    await range30.click()
    await page.waitForTimeout(600)
    await shoot(page, '06-history-30days')
  }

  // Click first workout card
  const firstCard = page.locator('button:has(h3)').first()
  await firstCard.click()
  await page.waitForURL(/\/workout\/[^/]+$/, { timeout: 10_000 })
  await page.waitForTimeout(2000)
}

async function flowWorkoutDetail(page, viewport) {
  console.log('\n🏋️ WorkoutDetail (the migrated page)')

  // Read mode — the changed page!
  await shoot(page, '07-workoutdetail-read')

  // Tall screenshot to capture more
  const tallH = viewport.width < 500 ? 1500 : 1300
  await page.setViewportSize({ width: viewport.width, height: tallH })
  await page.waitForTimeout(400)
  await shoot(page, '07b-workoutdetail-read-tall')
  await page.setViewportSize(viewport)
  await page.waitForTimeout(300)

  // Open edit mode
  const editBtn = page.getByRole('button', { name: /^Edytuj$/ }).first()
  await editBtn.click()
  await page.waitForTimeout(800)
  await shoot(page, '08-workoutdetail-edit-opened')

  // Click a different label chip (e.g., "Push") to verify hero updates
  const pushChip = page.getByRole('button', { name: 'Push', exact: true }).first()
  if ((await pushChip.count()) > 0) {
    await pushChip.click()
    await page.waitForTimeout(500)
    await shoot(page, '09-workoutdetail-edit-label-changed')
  }

  // Cancel without saving
  const cancelBtn = page.getByRole('button', { name: 'Anuluj' }).first()
  if ((await cancelBtn.count()) > 0) {
    await cancelBtn.click()
    await page.waitForTimeout(800)
    await shoot(page, '10-workoutdetail-after-cancel')
  }

  // Verify the original label is restored — open edit again and immediately save
  const editBtn2 = page.getByRole('button', { name: /^Edytuj$/ }).first()
  await editBtn2.click()
  await page.waitForTimeout(600)
  // Change weight in first set's input
  const firstWeightInput = page.locator('input[type="number"]').first()
  if ((await firstWeightInput.count()) > 0) {
    await firstWeightInput.fill('999')
    await page.waitForTimeout(300)
    await shoot(page, '11-workoutdetail-edit-weight-changed')
  }
  // Cancel — don't actually save the bogus 999
  const cancelBtn2 = page.getByRole('button', { name: 'Anuluj' }).first()
  await cancelBtn2.click()
  await page.waitForTimeout(800)
  await shoot(page, '12-workoutdetail-final')

  // Test back button
  const backBtn = page.getByRole('button', { name: /Wróć/i }).first()
  if ((await backBtn.count()) > 0) {
    await backBtn.click()
    await page.waitForTimeout(1200)
    console.log(`   back nav → ${page.url()}`)
  }
}

async function flowTemplates(page) {
  console.log('\n📋 Templates')
  await page.goto(`${BASE}/templates`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await shoot(page, '13-templates-list')

  // Expand first template
  const expandBtn = page.getByRole('button', { name: /Pokaż dni planu/i }).first()
  if ((await expandBtn.count()) > 0) {
    await expandBtn.click()
    await page.waitForTimeout(700)
    await shoot(page, '14-templates-expanded')
  }
}

async function flowExercises(page) {
  console.log('\n💪 Exercises')
  await page.goto(`${BASE}/exercises`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await shoot(page, '15-exercises-list')

  // Click bench press
  const benchLink = page.locator('a, button').filter({ hasText: /Bench Press/i }).first()
  if ((await benchLink.count()) > 0) {
    await benchLink.click()
    await page.waitForTimeout(2500)
    await shoot(page, '16-exercise-detail-bench')
  } else {
    console.log('   ⚠️ Bench Press card not found, trying any exercise')
    const anyLink = page.locator('a[href^="/exercises/"]').first()
    if ((await anyLink.count()) > 0) {
      await anyLink.click()
      await page.waitForTimeout(2500)
      await shoot(page, '16-exercise-detail-any')
    }
  }
}

async function flowProgress(page) {
  console.log('\n📊 Progress')
  await page.goto(`${BASE}/progress`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500) // recharts needs time
  await shoot(page, '17-progress')
}

async function flowChat(page) {
  console.log('\n🤖 Chat')
  await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await shoot(page, '18-chat')
}

async function flowProfile(page) {
  console.log('\n👤 Profile')
  await page.goto(`${BASE}/profile`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await shoot(page, '19-profile')
}

async function flowWorkoutNew(page) {
  console.log('\n🆕 New workout (start session)')
  await page.goto(`${BASE}/workout/new`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await shoot(page, '20-workout-new-empty')

  // Try opening exercise picker via "+ Dodaj ćwiczenie" or similar
  const addBtn = page.getByRole('button', { name: /Dodaj ćwiczenie/i }).first()
  if ((await addBtn.count()) > 0) {
    await addBtn.click()
    await page.waitForTimeout(900)
    await shoot(page, '21-exercise-picker')
    // Close picker — try common close selectors
    const closeBtn = page.getByRole('button', { name: /zamknij|×|close/i }).first()
    if ((await closeBtn.count()) > 0) {
      await closeBtn.click()
      await page.waitForTimeout(400)
    } else {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    }
  } else {
    console.log('   ⚠️ "Dodaj ćwiczenie" button not found')
  }
}

async function runViewport(browser, viewportName, viewport, deviceCtx) {
  console.log(`\n========== ${viewportName.toUpperCase()} (${viewport.width}×${viewport.height}) ==========`)
  const context = await browser.newContext({ ...deviceCtx, viewport, serviceWorkers: 'block' })
  await guardQaCaptureContext(context, BASE)
  await context.addInitScript(() => {
    const s = document.createElement('style')
    s.textContent = '*, *::before, *::after { animation-duration:0.001ms !important; transition-duration:0.001ms !important; }'
    if (document.head) document.head.appendChild(s)
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s))
  })
  const page = await context.newPage()
  attachListeners(page, viewportName)

  try {
    // Mobile: skip the wrong-password test (only do once, on desktop)
    await login(page, viewportName === 'desktop')
    await flowDashboard(page)
    await flowHistory(page)
    await flowWorkoutDetail(page, viewport)
    await flowTemplates(page)
    await flowExercises(page)
    await flowProgress(page)
    await flowChat(page)
    await flowProfile(page)
    await flowWorkoutNew(page)
  } catch (err) {
    console.log(`\n💥 [${viewportName}] flow exception: ${err.message}`)
    errors.push({ viewport: viewportName, url: page.url(), error: 'flow exception: ' + err.message, stack: err.stack?.split('\n').slice(0, 4).join(' | ') })
    await shoot(page, `99-EXCEPTION-${viewportName}`)
  }

  // Rename screenshots with viewport prefix
  const filesAfter = await fs.readdir(OUT)
  for (const f of filesAfter) {
    if (f.startsWith(viewportName + '-') || f.startsWith('M-') || f.startsWith('D-')) continue
    if (f.endsWith('.png')) {
      const prefix = viewportName === 'mobile' ? 'M' : 'D'
      await fs.rename(`${OUT}/${f}`, `${OUT}/${prefix}-${f}`).catch(() => {})
    }
  }

  await context.close()
}

const browser = await chromium.launch({ headless: true })
try {
  await runViewport(browser, 'desktop', { width: 1440, height: 900 }, { deviceScaleFactor: 2 })
  await runViewport(browser, 'mobile', { width: 393, height: 852 }, { ...devices['iPhone 14 Pro'], deviceScaleFactor: 3 })
} finally {
  await browser.close()
}

console.log('\n========== QA REPORT ==========')
console.log(`\n🔴 Page errors (${errors.length}):`)
errors.forEach((e) => console.log(`   [${e.viewport}] ${e.url}\n      ${e.error}\n      ${e.stack ?? ''}`))
console.log(`\n🟡 Console errors (${consoleErrors.length}):`)
consoleErrors.slice(0, 20).forEach((e) => console.log(`   [${e.viewport}] ${e.url.slice(0, 80)}\n      ${e.text}`))
if (consoleErrors.length > 20) console.log(`   ... + ${consoleErrors.length - 20} more`)
console.log(`\n🟠 Failed requests (${failedRequests.length}):`)
failedRequests.slice(0, 20).forEach((r) => console.log(`   [${r.viewport}] ${r.method} ${r.url} — ${r.failure}`))
if (failedRequests.length > 20) console.log(`   ... + ${failedRequests.length - 20} more`)

if (errors.length) process.exitCode = 1
console.log(`\nQA finished — screenshots in ${OUT}/`)
