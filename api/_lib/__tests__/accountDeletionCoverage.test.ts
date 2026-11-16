import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../firebaseAdmin.js', () => ({ adminAuth: {}, adminDb: {} }))
import { DELETED_BY_ID, DELETED_BY_USER_ID, KEPT_ON_DELETION } from '../accountDeletion.js'

const root = join(__dirname, '../../..')
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === 'node_modules' || name === '__tests__' || name.includes('.test.')) return []
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

// Every collection the app knows about is either deleted with the account or kept on purpose, with a reason.
describe('account deletion covers every collection', () => {
  it('lists each collection from the rules and from code', () => {
    const names = new Set<string>()
    for (const match of readFileSync(join(root, 'firestore.rules'), 'utf8').matchAll(/match \/([A-Za-z]+)\/\{/g)) names.add(match[1]!)
    for (const file of ['api', 'src/lib', 'mobile/src'].flatMap((dir) => sources(join(root, dir)))) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/collection\(\s*(?:[A-Za-z]+\s*,\s*)?['"]([A-Za-z]+)['"]/g)) names.add(match[1]!)
      for (const match of text.matchAll(/doc\(\s*[A-Za-z.]+\s*,\s*['"]([A-Za-z]+)['"]/g)) names.add(match[1]!)
    }
    names.delete('databases')
    const known = new Set<string>([...DELETED_BY_USER_ID, ...DELETED_BY_ID, ...Object.keys(KEPT_ON_DELETION)])
    expect([...names].filter((name) => !known.has(name)).sort()).toEqual([])
    expect(names.has('workoutMutationOperations') && names.has('aiRateLimits')).toBe(true)
  })
})
