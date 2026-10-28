// Renders every PNG app icon from public/app-icon-source.svg. Run after changing the icon: node scripts/render-icons.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const source = new URL('../public/app-icon-source.svg', import.meta.url).href
const out = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url))

// Android shows only the middle 72 of 108 dp of each layer; at this scale the mark takes about the same share
// of the visible icon as it does of the web icon (~55%), instead of nearly filling the circle.
const ADAPTIVE_MARK_SCALE = 0.72

const icons = [
  { path: 'public/icon-192.png', size: 192 },
  { path: 'public/icon-512.png', size: 512 },
  { path: 'public/icon-maskable-512.png', size: 512 },
  { path: 'public/apple-touch-icon.png', size: 180 },
  { path: 'mobile/assets/icon.png', size: 1024 },
  { path: 'mobile/assets/adaptive-icon-background.png', size: 1024, hide: '#mark' },
  { path: 'mobile/assets/adaptive-icon-foreground.png', size: 1024, hide: '#background', markScale: ADAPTIVE_MARK_SCALE },
]

const browser = await chromium.launch()
try {
  for (const { path, size, hide, markScale } of icons) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.goto(source)
    await page.evaluate(({ hide, markScale }) => {
      if (hide) document.querySelector(hide).setAttribute('display', 'none')
      if (markScale) document.querySelector('#mark').setAttribute('transform', `translate(512 512) scale(${markScale}) translate(-512 -512)`)
    }, { hide, markScale })
    await page.screenshot({ path: out(path), omitBackground: hide === '#background' })
    await page.close()
  }
} finally {
  await browser.close()
}
