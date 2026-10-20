import type { QuerySnapshot } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'

import { confirmedQuery } from '../confirmedQuery'

const snapshot = (empty: boolean, fromCache: boolean) => ({ empty, metadata: { fromCache } }) as unknown as QuerySnapshot

describe('confirmedQuery', () => {
  it('reports an empty answer from the offline cache as unknown, not as no data', () => {
    expect(() => confirmedQuery(snapshot(true, true))).toThrow('No connection')
    expect(confirmedQuery(snapshot(true, false)).empty).toBe(true)
    expect(confirmedQuery(snapshot(false, true)).empty).toBe(false)
  })
})
