import { describe, it, expect, vi } from 'vitest'

const firestore = vi.hoisted(() => ({
  doc: vi.fn(() => 'readiness-ref'),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}))

vi.mock('../firebase', () => ({ db: { name: 'test-db' }, auth: {} }))
vi.mock('firebase/firestore', () => ({
  doc: firestore.doc,
  getDoc: firestore.getDoc,
  setDoc: firestore.setDoc,
}))

import { computeReadinessScore, getReadiness } from '../readinessService'

// Formula: sleep×0.4 + mood×0.3 + (6−soreness)×0.3 → scale to 0..100
// raw ∈ [1,5] → min=1, max=5 → score = round(((raw-1)/4)*100)

describe('getReadiness', () => {
  it('reads the document for the exact local date supplied by the caller', async () => {
    firestore.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        userId: 'user-1',
        date: '2026-07-12',
        sleep: 4,
        mood: 5,
        soreness: 2,
        createdAt: 123,
      }),
    })

    await expect(getReadiness('user-1', '2026-07-12')).resolves.toEqual({
      userId: 'user-1',
      date: '2026-07-12',
      sleep: 4,
      mood: 5,
      soreness: 2,
      createdAt: 123,
    })
    expect(firestore.doc).toHaveBeenCalledWith(
      { name: 'test-db' },
      'readiness',
      'user-1_2026-07-12',
    )
  })

  it('returns null only when the requested document does not exist', async () => {
    firestore.getDoc.mockResolvedValueOnce({ exists: () => false })

    await expect(getReadiness('user-1', '2026-07-12')).resolves.toBeNull()
  })
})

describe('computeReadinessScore', () => {
  it('returns max score (100) for perfect inputs (5,5,1)', () => {
    const result = computeReadinessScore({ sleep: 5, mood: 5, soreness: 1 })
    expect(result.score).toBe(100)
    expect(result.tone).toBe('high')
    expect(result.label).toBe('Gotowy')
  })

  it('returns min score (0) for worst inputs (1,1,5)', () => {
    const result = computeReadinessScore({ sleep: 1, mood: 1, soreness: 5 })
    expect(result.score).toBe(0)
    expect(result.tone).toBe('low')
    expect(result.label).toBe('Odpoczynek')
  })

  it('returns mid-range score for average inputs (3,3,3)', () => {
    // raw = 3*0.4 + 3*0.3 + (6-3)*0.3 = 1.2 + 0.9 + 0.9 = 3.0
    // score = round(((3-1)/4)*100) = round(50) = 50
    const result = computeReadinessScore({ sleep: 3, mood: 3, soreness: 3 })
    expect(result.score).toBe(50)
    expect(result.tone).toBe('mid')
    expect(result.label).toBe('Umiarkowany')
  })

  it('tone=high when score >= 70', () => {
    // sleep=5 mood=4 soreness=1 → raw=5*0.4+4*0.3+(6-1)*0.3=2+1.2+1.5=4.7
    // score=round(((4.7-1)/4)*100)=round(92.5)=93
    const result = computeReadinessScore({ sleep: 5, mood: 4, soreness: 1 })
    expect(result.tone).toBe('high')
    expect(result.score).toBeGreaterThanOrEqual(70)
  })

  it('tone=mid when score is 40-69', () => {
    // sleep=2 mood=3 soreness=3 → raw=2*0.4+3*0.3+(6-3)*0.3=0.8+0.9+0.9=2.6
    // score=round(((2.6-1)/4)*100)=round(40)=40
    const result = computeReadinessScore({ sleep: 2, mood: 3, soreness: 3 })
    expect(result.tone).toBe('mid')
    expect(result.score).toBeGreaterThanOrEqual(40)
    expect(result.score).toBeLessThan(70)
  })

  it('tone=low when score < 40', () => {
    // sleep=1 mood=2 soreness=4 → raw=0.4+0.6+0.6=1.6
    // score=round(((1.6-1)/4)*100)=round(15)=15
    const result = computeReadinessScore({ sleep: 1, mood: 2, soreness: 4 })
    expect(result.tone).toBe('low')
    expect(result.label).toBe('Odpoczynek')
    expect(result.score).toBeLessThan(40)
  })

  it('result always contains score, tone, color, and label', () => {
    const result = computeReadinessScore({ sleep: 3, mood: 3, soreness: 3 })
    expect(result).toHaveProperty('score')
    expect(result).toHaveProperty('tone')
    expect(result).toHaveProperty('color')
    expect(result).toHaveProperty('label')
    expect(typeof result.score).toBe('number')
  })
})
