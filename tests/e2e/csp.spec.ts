import { readFileSync } from 'node:fs'
import type { BrowserContext, Page, Response } from '@playwright/test'
import { test, expect } from './fixtures'
import { expectAppReady } from './support/appReady'

interface VercelHeader {
  key: string
  value: string
}

interface VercelConfig {
  headers: Array<{
    source: string
    headers: VercelHeader[]
  }>
}

const vercelConfig = JSON.parse(
  readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
) as VercelConfig

function cspHeaders(): VercelHeader[] {
  return vercelConfig.headers
    .flatMap((entry) => entry.headers)
    .filter((header) => header.key.startsWith('Content-Security-Policy'))
}

function parsePolicy(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(';')
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...values] = directive.split(/\s+/)
        return [name, values] as const
      }),
  )
}

const APP_ORIGIN = 'http://127.0.0.1:5174'
const LOCAL_ALLOWED_ORIGINS = new Set([
  APP_ORIGIN,
  'http://127.0.0.1:8080',
  'http://127.0.0.1:9099',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
])

async function installCspObservation(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const state = window as typeof window & {
      __ironlogCspViolations?: string[]
    }
    state.__ironlogCspViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      state.__ironlogCspViolations?.push(
        `${event.effectiveDirective}: ${event.blockedURI}`,
      )
    })
  })
}

function observeOrigins(page: Page): Set<string> {
  const origins = new Set<string>()
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      origins.add(url.origin)
    }
  })
  return origins
}

async function expectCleanCsp(
  page: Page,
  origins: Set<string>,
): Promise<void> {
  const violations = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __ironlogCspViolations?: string[]
        }
      ).__ironlogCspViolations ?? [],
  )
  expect(violations).toEqual([])
  expect(
    [...origins].filter((origin) => !LOCAL_ALLOWED_ORIGINS.has(origin)),
  ).toEqual([])
}

function expectEnforcedResponse(response: Response | null): void {
  const headers = response?.headers() ?? {}
  expect(headers['content-security-policy']).toContain("default-src 'self'")
  expect(headers['content-security-policy-report-only']).toBeUndefined()
}

test('production config enforces the minimal CSP contract', () => {
  const headers = cspHeaders()
  expect(headers).toHaveLength(1)
  expect(headers[0]?.key).toBe('Content-Security-Policy')

  const policy = headers[0]?.value ?? ''
  const directives = parsePolicy(policy)

  expect(directives.get('default-src')).toEqual(["'self'"])
  expect(directives.get('script-src')).toEqual(["'self'"])
  expect(directives.get('connect-src')).toEqual([
    "'self'",
    'https://*.googleapis.com',
  ])
  expect(directives.get('img-src')).toEqual(["'self'", 'data:'])
  expect(directives.get('style-src')).toEqual([
    "'self'",
    "'unsafe-inline'",
    'https://fonts.googleapis.com',
  ])
  expect(directives.get('font-src')).toEqual([
    "'self'",
    'https://fonts.gstatic.com',
  ])
  expect(directives.get('frame-src')).toEqual([
    "'self'",
    'https://*.firebaseapp.com',
  ])
  expect(directives.get('object-src')).toEqual(["'none'"])
  expect(directives.get('base-uri')).toEqual(["'self'"])
  expect(directives.get('form-action')).toEqual(["'self'"])
  expect(directives.get('frame-ancestors')).toEqual(["'none'"])
  expect(policy).not.toMatch(
    /localhost|127\.0\.0\.1|firebaseio|google-analytics|googletagmanager|hotjar|contentsquare/i,
  )
})

test.describe('public route CSP', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('login loads under the enforced policy', async ({ context, page }) => {
    await installCspObservation(context)
    const origins = observeOrigins(page)

    const response = await page.goto('/login')
    expectEnforcedResponse(response)
    await expectAppReady(page, '/login')

    await expectCleanCsp(page, origins)
  })
})

test('dashboard loads under the enforced policy', async ({ context, page }) => {
  await installCspObservation(context)
  const origins = observeOrigins(page)

  const response = await page.goto('/dashboard')
  expectEnforcedResponse(response)
  await expectAppReady(page, '/dashboard')

  await expectCleanCsp(page, origins)
})
