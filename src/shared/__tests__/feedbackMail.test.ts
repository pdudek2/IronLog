import { describe, expect, it } from 'vitest'
import { FEEDBACK_EMAIL, feedbackMailto } from '../feedbackMail'

describe('feedbackMailto', () => {
  it('addresses the support inbox with an encoded subject and a footer of platform, system, version and date', () => {
    const url = feedbackMailto({ platform: 'Android', system: 'Android 16 · Pixel 9', version: '0.1.0 (812)', date: new Date('2026-11-16T20:00:00Z') })
    expect(url.startsWith(`mailto:${FEEDBACK_EMAIL}?subject=SHEAR%20feedback&body=`)).toBe(true)
    const body = decodeURIComponent(url.split('&body=')[1]!)
    expect(body).toBe('\n\n---\nPlatform: Android\nSystem: Android 16 · Pixel 9\nVersion: 0.1.0 (812)\nDate: 2026-11-16')
    expect(url).not.toMatch(/[\s·]/)
  })
})
