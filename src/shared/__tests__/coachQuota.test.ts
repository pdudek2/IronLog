import { describe, expect, it } from 'vitest'
import { formatQuotaHeader, parseQuotaHeader } from '../coachQuota'

describe('coach quota header', () => {
  it('round-trips and rejects anything else', () => {
    expect(parseQuotaHeader(formatQuotaHeader({ used: 7, limit: 20 }))).toEqual({ used: 7, limit: 20 })
    expect(parseQuotaHeader(null)).toBeNull()
    expect(parseQuotaHeader('used=-1;limit=20')).toBeNull()
    expect(parseQuotaHeader('limit=20;used=1')).toBeNull()
  })
})
