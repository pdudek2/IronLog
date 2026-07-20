import { expect, test, type Locator, type Page } from './fixtures'
import { expectAppReady } from './support/appReady'

interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

function parseColor(value: string): Rgba {
  const hex = value.trim().match(/^#([\da-f]{6}|[\da-f]{8})$/i)
  if (hex) {
    const channels = hex[1]
    return {
      r: Number.parseInt(channels.slice(0, 2), 16),
      g: Number.parseInt(channels.slice(2, 4), 16),
      b: Number.parseInt(channels.slice(4, 6), 16),
      a: channels.length === 8 ? Number.parseInt(channels.slice(6, 8), 16) / 255 : 1,
    }
  }

  const rgb = value.trim().match(/^rgba?\(([^)]+)\)$/i)
  if (!rgb) throw new Error(`Unsupported CSS color: ${value}`)

  const channels = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number)
  if (channels.length < 3 || channels.slice(0, 3).some(Number.isNaN)) {
    throw new Error(`Unsupported CSS color: ${value}`)
  }

  return {
    r: channels[0],
    g: channels[1],
    b: channels[2],
    a: channels[3] ?? 1,
  }
}

function composite(foreground: Rgba, background: Rgba): Rgba {
  const alpha = foreground.a + background.a * (1 - foreground.a)
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 }

  return {
    r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
    g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
    b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
    a: alpha,
  }
}

function relativeLuminance(color: Rgba): number {
  const linear = [color.r, color.g, color.b].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(first: Rgba, second: Rgba): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second))
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

function gradientColors(backgroundImage: string): Rgba[] {
  return [...backgroundImage.matchAll(/rgba?\([^)]+\)/gi)].map(([color]) => parseColor(color))
}

function expectSameRgb(actual: Rgba, expected: Rgba, label: string): void {
  expect(actual.r, `${label} red channel`).toBeCloseTo(expected.r, 0)
  expect(actual.g, `${label} green channel`).toBeCloseTo(expected.g, 0)
  expect(actual.b, `${label} blue channel`).toBeCloseTo(expected.b, 0)
}

async function readResolvedTokens(page: Page, names: string[]) {
  return page.evaluate((tokenNames) => {
    const rootStyle = getComputedStyle(document.documentElement)
    const probe = document.createElement('span')
    probe.hidden = true
    document.body.append(probe)

    const tokens = Object.fromEntries(tokenNames.map((name) => {
      probe.style.color = `var(${name})`
      return [name, {
        raw: rootStyle.getPropertyValue(name).trim(),
        resolved: getComputedStyle(probe).color,
      }]
    }))

    probe.remove()
    return tokens
  }, names)
}

async function readPrimaryState(cta: Locator) {
  return cta.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      color: style.color,
    }
  })
}

test.describe('Contrast contracts', () => {
  test('computed helper text and enabled primary CTA stay above 4.5:1', async ({ page }) => {
    await page.goto('/dashboard')
    await expectAppReady(page, '/dashboard')

    const helperText = page.locator('.dashboard-week-bar-cell small').first()
    const primaryCta = page.locator('button.hero-editorial-cta').first()
    await expect(helperText).toBeVisible()
    await expect(primaryCta).toBeVisible()
    await expect(primaryCta).toBeEnabled()

    const tokens = await readResolvedTokens(page, [
      '--muted-soft',
      '--bg',
      '--surface-2',
      '--primary-start',
      '--primary-end',
      '--accent-foreground',
    ])
    const mutedSoft = parseColor(tokens['--muted-soft'].resolved)
    const pageBackground = parseColor(tokens['--bg'].resolved)
    const surface2 = parseColor(tokens['--surface-2'].resolved)
    const primaryStart = parseColor(tokens['--primary-start'].resolved)
    const primaryEnd = parseColor(tokens['--primary-end'].resolved)
    const primaryForeground = parseColor(tokens['--accent-foreground'].resolved)

    expect(tokens['--muted-soft'].raw, '--muted-soft should be defined at the root').not.toBe('')
    expect(tokens['--bg'].raw, '--bg should be defined at the root').not.toBe('')
    expect(tokens['--primary-start'].raw, '--primary-start should be defined at the root').not.toBe('')
    expect(tokens['--primary-end'].raw, '--primary-end should be defined at the root').not.toBe('')

    const helperStyles = await helperText.evaluate((element) => {
      const helper = getComputedStyle(element)
      let surface = element.parentElement
      while (surface) {
        const style = getComputedStyle(surface)
        const hasBackgroundColor = style.backgroundColor !== 'rgba(0, 0, 0, 0)'
          && style.backgroundColor !== 'transparent'
        if (style.backgroundImage !== 'none' || hasBackgroundColor) {
          return {
            color: helper.color,
            surfaceBackgroundColor: style.backgroundColor,
            surfaceBackgroundImage: style.backgroundImage,
            surfaceClassName: surface.className,
          }
        }
        surface = surface.parentElement
      }
      throw new Error('No painted surface found for helper text')
    })

    expectSameRgb(parseColor(helperStyles.color), mutedSoft, 'actual helper text')
    expect(contrastRatio(mutedSoft, pageBackground), '--muted-soft on --bg').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(mutedSoft, surface2), '--muted-soft on --surface-2').toBeGreaterThanOrEqual(4.5)

    const actualSurfaceStops = gradientColors(helperStyles.surfaceBackgroundImage)
    expect(actualSurfaceStops.length, `painted helper surface ${helperStyles.surfaceClassName}`).toBeGreaterThan(0)
    for (const stop of actualSurfaceStops) {
      const paintedStop = stop.a < 1 ? composite(stop, pageBackground) : stop
      expect(
        contrastRatio(parseColor(helperStyles.color), paintedStop),
        `actual helper text on ${helperStyles.surfaceClassName}`,
      ).toBeGreaterThanOrEqual(4.5)
    }

    expect(contrastRatio(primaryForeground, primaryStart), 'primary foreground on start token').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(primaryForeground, primaryEnd), 'primary foreground on end token').toBeGreaterThanOrEqual(4.5)

    const states = [{ name: 'default', styles: await readPrimaryState(primaryCta) }]
    await primaryCta.hover()
    states.push({ name: 'hover', styles: await readPrimaryState(primaryCta) })

    const box = await primaryCta.boundingBox()
    expect(box, 'enabled primary CTA should have a bounding box').not.toBeNull()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    try {
      states.push({ name: 'active', styles: await readPrimaryState(primaryCta) })
    } finally {
      await page.mouse.up()
    }

    for (const { name, styles } of states) {
      const stops = gradientColors(styles.backgroundImage)
      expect(stops, `${name} CTA should use a computed gradient`).toHaveLength(2)
      expectSameRgb(stops[0], primaryStart, `${name} CTA start`)
      expectSameRgb(stops[1], primaryEnd, `${name} CTA end`)
      expectSameRgb(parseColor(styles.color), primaryForeground, `${name} CTA foreground`)
      for (const stop of stops) {
        expect(
          contrastRatio(parseColor(styles.color), stop),
          `${name} CTA foreground against every computed gradient stop`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
