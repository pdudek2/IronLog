// Ad-hoc verification: log in as demo, navigate to a workout detail, screenshot.
// Run from project root: node scripts/verify-workout-detail.mjs
// Output: /tmp/workout-detail-verify/{mobile,desktop}-{read,edit}.png
import { chromium, devices } from '@playwright/test'
import fs from 'node:fs/promises'

const BASE = 'http://localhost:5173'
const OUT = '/tmp/workout-detail-verify'
await fs.rm(OUT, { recursive: true, force: true })
await fs.mkdir(OUT, { recursive: true })

const DISABLE_ANIM = `*, *::before, *::after { animation-duration:0.001ms !important; transition-duration:0.001ms !important; }`

async function captureViewport(browser, name, viewport, deviceCtx) {
  const context = await browser.newContext({ ...deviceCtx, viewport })
  await context.addInitScript(() => {
    const s = document.createElement('style')
    s.textContent = '*, *::before, *::after { animation-duration:0.001ms !important; transition-duration:0.001ms !important; }'
    if (document.head) document.head.appendChild(s)
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s))
  })
  const page = await context.newPage()
  await page.addStyleTag({ content: DISABLE_ANIM }).catch(() => {})

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('user@mail.pl').fill('demo@ironlog.app')
  await page.getByPlaceholder('••••••••').fill('demo123')
  await page.getByRole('button', { name: 'Zaloguj się' }).click()
  await page.waitForURL(`${BASE}/dashboard`, { timeout: 25_000 })
  await page.waitForTimeout(1500)

  await page.goto(`${BASE}/history`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)

  // Workout cards in /history are <motion.button> with h3 inside (workout title)
  const card = page.locator('button:has(h3)').first()
  const count = await card.count()
  if (count === 0) {
    console.log(`[${name}] no workout cards found on /history`)
    await page.screenshot({ path: `${OUT}/${name}-DEBUG-no-card.png`, fullPage: true })
    await context.close()
    return
  }
  await card.click()
  await page.waitForURL(/\/workout\/[^/]+$/, { timeout: 10_000 })
  await page.waitForTimeout(2200)
  await page.evaluate(() => document.fonts.ready)

  const tall = name === 'mobile' ? 1500 : 1300
  await page.setViewportSize({ width: viewport.width, height: tall })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/${name}-read.png`, fullPage: false })
  console.log(`[${name}] read mode → ${OUT}/${name}-read.png`)

  await page.setViewportSize(viewport)
  await page.waitForTimeout(300)
  const editBtn = page.getByRole('button', { name: /^Edytuj$/ }).first()
  if ((await editBtn.count()) > 0) {
    await editBtn.click()
    await page.waitForTimeout(800)
    await page.setViewportSize({ width: viewport.width, height: tall })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/${name}-edit.png`, fullPage: false })
    console.log(`[${name}] edit mode → ${OUT}/${name}-edit.png`)
  } else {
    console.log(`[${name}] edit button not found`)
  }

  await context.close()
}

const browser = await chromium.launch({ headless: true })
try {
  await captureViewport(browser, 'mobile', { width: 393, height: 852 }, { ...devices['iPhone 14 Pro'], deviceScaleFactor: 3 })
  await captureViewport(browser, 'desktop', { width: 1440, height: 900 }, { deviceScaleFactor: 2 })
} finally {
  await browser.close()
}
console.log('done')
