import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures'

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
