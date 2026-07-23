# Phase 2B User Exercise Uniqueness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zapewnić atomową unikalność nazw własnych ćwiczeń bez zmiany istniejących `exerciseId`.

**Status:** COMPLETED — VERIFIED — INTEGRATED LOCALLY

**Architecture:** `userExerciseNames/{uid}_{sha256(name)}` jest lekkim claimem nazwy. Serwis klienta zapisuje claim i `userExercises` w jednej transakcji, a reguły wymagają zgodności obu dokumentów przez `getAfter`; legacy dokumenty są przejmowane przy pierwszej zmianie nazwy bez migracji ID.

**Tech Stack:** React 19, TypeScript, Firebase Web SDK, Firestore transactions, Firestore Rules emulator, Vitest.

## Global Constraints

- Zachować `exerciseSource: 'user'` i wszystkie istniejące identyfikatory.
- Nie dodawać backendu, zależności ani migracji istniejących dokumentów.
- Nazwa jest unikalna według dokładnej wartości po `trim()`; bez case folding.
- Serwisy w `src/lib/` pozostają jedyną warstwą bezpośrednich operacji Firestore.
- Push, deploy i publikacja reguł produkcyjnych pozostają poza zakresem.

---

### Task 1: Atomowy create i reguły claimu

**Files:**
- Modify: `src/lib/userExercisesService.ts`
- Modify: `firestore.rules`
- Modify/Test: `tests/rules/firestore.rules.test.ts`

**Interfaces:**
- Produces: `createUserExercise(uid, input, database?)`
- Produces: dokument claimu `{ userId, exerciseId, name }`
- Produces: pole `nameClaimId` na nowych `userExercises`

- [x] **Step 1: Dodać failing test bezpośredniego create bez claimu**

W `tests/rules/firestore.rules.test.ts` zmienić test `userExercises rules`, aby:

```ts
const db = testEnv.authenticatedContext('alice').firestore()
await assertFails(setDoc(
  doc(db, 'userExercises', 'custom-without-claim'),
  validUserExercise('alice'),
))
```

- [x] **Step 2: Dodać failing test równoległego create**

Mockować moduł produkcyjnego `db`, a do serwisu przekazać emulatorowy `Firestore`:

```ts
vi.mock('../../src/lib/firebase', () => ({ db: null }))

const input = {
  name: 'Concurrent Curl',
  category: 'arms' as const,
  equipment: 'dumbbell' as const,
  muscles: ['biceps'] as const,
}
const results = await Promise.allSettled([
  createUserExercise('alice', input, db),
  createUserExercise('alice', input, db),
])

expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
const stored = await getDocs(query(
  collection(db, 'userExercises'),
  where('userId', '==', 'alice'),
  where('name', '==', input.name),
))
expect(stored.size).toBe(1)
```

- [x] **Step 3: Uruchomić rules test i potwierdzić RED**

Run:

```bash
npm run test:rules
```

Expected: direct create bez claimu nadal przechodzi albo równoległe create zapisuje dwa dokumenty.

- [x] **Step 4: Zaimplementować minimalny claim i transakcyjny create**

W `src/lib/userExercisesService.ts`:

```ts
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore'

interface StoredUserExercise extends UserExerciseInput {
  userId: string
  nameClaimId?: string
}

async function buildNameClaimId(uid: string, name: string): Promise<string> {
  const bytes = new TextEncoder().encode(name)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${uid}_${hash}`
}

function duplicateNameError(name: string): Error {
  return new Error(`Ćwiczenie o nazwie "${name}" już istnieje.`)
}

export async function createUserExercise(
  uid: string,
  input: UserExerciseInput,
  database: Firestore = db,
): Promise<Exercise> {
  const name = input.name.trim()
  const duplicate = await getDocs(query(
    collection(database, 'userExercises'),
    where('userId', '==', uid),
    where('name', '==', name),
    limit(1),
  ))
  if (!duplicate.empty) throw duplicateNameError(name)

  const nameClaimId = await buildNameClaimId(uid, name)
  const exerciseRef = doc(collection(database, 'userExercises'))
  const claimRef = doc(database, 'userExerciseNames', nameClaimId)

  await runTransaction(database, async (transaction) => {
    const claim = await transaction.get(claimRef)
    if (claim.exists()) throw duplicateNameError(name)

    transaction.set(exerciseRef, {
      userId: uid,
      name,
      category: input.category,
      equipment: input.equipment,
      muscles: input.muscles,
      nameClaimId,
    })
    transaction.set(claimRef, { userId: uid, exerciseId: exerciseRef.id, name })
  })

  return { id: exerciseRef.id, ...input, name }
}
```

- [x] **Step 5: Egzekwować claim w regułach**

Rozszerzyć `isUserExercise` o opcjonalne `nameClaimId`, dodać `isUserExerciseNameClaim`, `hasNameClaim` i `hasMatchingNameClaim`, a następnie:

```text
match /userExercises/{id} {
  allow create: if ownsNewDoc()
                && isUserExercise(request.resource.data)
                && hasMatchingNameClaim(id, request.resource.data);
  allow read: if ownsDoc();
  allow update: if ownsDoc()
                && keepsOwner()
                && isUserExercise(request.resource.data)
                && (
                  hasMatchingNameClaim(id, request.resource.data)
                  || (
                    !hasNameClaim(resource.data)
                    && !hasNameClaim(request.resource.data)
                    && request.resource.data.name == resource.data.name
                  )
                );
  allow delete: if ownsDoc()
                && (
                  !hasNameClaim(resource.data)
                  || !existsAfter(/databases/$(database)/documents/userExerciseNames/$(resource.data.nameClaimId))
                );
}

match /userExerciseNames/{claimId} {
  allow read: if ownsDoc()
              || (signedIn() && claimId.matches('^' + currentUid() + '_[0-9a-f]{64}$'));
  allow create, update: if ownsNewDoc()
                        && isUserExerciseNameClaim(request.resource.data)
                        && getAfter(/databases/$(database)/documents/userExercises/$(request.resource.data.exerciseId)).data.userId == currentUid()
                        && getAfter(/databases/$(database)/documents/userExercises/$(request.resource.data.exerciseId)).data.nameClaimId == claimId
                        && getAfter(/databases/$(database)/documents/userExercises/$(request.resource.data.exerciseId)).data.name == request.resource.data.name;
  allow delete: if ownsDoc();
}
```

- [x] **Step 6: Uruchomić rules test i potwierdzić GREEN**

Run:

```bash
npm run test:rules
```

Expected: jeden z dwóch create przechodzi, drugi zwraca komunikat duplikatu, direct create bez claimu jest odrzucony.

- [x] **Step 7: Commit**

```bash
git add src/lib/userExercisesService.ts firestore.rules tests/rules/firestore.rules.test.ts
git commit -m "fix: make user exercise creation atomic"
```

### Task 2: Atomowy rename, legacy adoption i delete

**Files:**
- Modify: `src/lib/userExercisesService.ts`
- Modify/Test: `tests/rules/firestore.rules.test.ts`
- Modify: `scripts/seed-demo.ts`

**Interfaces:**
- Consumes: `nameClaimId` oraz claim z Task 1
- Produces: `updateUserExercise(id, input, database?)`
- Produces: `deleteUserExercise(id, database?)`

- [x] **Step 1: Dodać failing test równoległego rename**

Utworzyć dwa ćwiczenia przez serwis, a następnie:

```ts
const results = await Promise.allSettled([
  updateUserExercise(first.id, { ...input, name: 'Shared Name' }, db),
  updateUserExercise(second.id, { ...input, name: 'Shared Name' }, db),
])
expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
```

Query `userId + name` musi zwrócić dokładnie jeden dokument.

- [x] **Step 2: Dodać failing test legacy adoption**

Zasiać przez `withSecurityRulesDisabled` dokument `legacy-id` bez `nameClaimId`, wykonać `updateUserExercise('legacy-id', renamed, db)` i sprawdzić:

```ts
const stored = await getDoc(doc(db, 'userExercises', 'legacy-id'))
expect(stored.data()).toMatchObject({ name: renamed.name })
expect(stored.data()?.nameClaimId).toMatch(/^alice_[0-9a-f]{64}$/)
```

- [x] **Step 3: Dodać failing test delete → recreate**

```ts
const created = await createUserExercise('alice', input, db)
await deleteUserExercise(created.id, db)
await expect(createUserExercise('alice', input, db)).resolves.toMatchObject({ name: input.name })
```

- [x] **Step 4: Uruchomić rules test i potwierdzić RED**

Run `npm run test:rules`.

Expected: rename nadal używa nieatomowego query → `updateDoc`, a delete zostawia claim.

- [x] **Step 5: Zaimplementować update w jednej transakcji**

`updateUserExercise` ma zachować wstępne query legacy, obliczyć nowy claim, a w transakcji:

```ts
const current = await transaction.get(exerciseRef)
if (!current.exists()) throw new Error('Nie znaleziono ćwiczenia do aktualizacji.')

const stored = current.data() as StoredUserExercise
const previousClaimId = typeof stored.nameClaimId === 'string' ? stored.nameClaimId : ''
const nextClaim = await transaction.get(nextClaimRef)
const previousClaim = previousClaimId && previousClaimId !== nextClaimId
  ? await transaction.get(doc(database, 'userExerciseNames', previousClaimId))
  : null

if (nextClaim.exists() && nextClaim.data().exerciseId !== id) {
  throw duplicateNameError(name)
}

transaction.set(nextClaimRef, { userId: stored.userId, exerciseId: id, name })
if (previousClaim?.exists() && previousClaim.data().exerciseId === id) {
  transaction.delete(previousClaim.ref)
}
transaction.update(exerciseRef, {
  name,
  category: input.category,
  equipment: input.equipment,
  muscles: input.muscles,
  nameClaimId: nextClaimId,
})
```

Wszystkie odczyty transakcji muszą wystąpić przed pierwszym zapisem.

- [x] **Step 6: Zaimplementować delete claimu i ćwiczenia w jednej transakcji**

`deleteUserExercise(id, database = db)` odczytuje ćwiczenie, opcjonalnie claim, usuwa claim tylko gdy wskazuje ten sam `exerciseId`, a następnie usuwa ćwiczenie.

- [x] **Step 7: Czyścić claimy przy resetowaniu demo**

Dodać `userExerciseNames` do listy kolekcji kasowanych przez `resetDemo`.

- [x] **Step 8: Uruchomić rules test i potwierdzić GREEN**

Run:

```bash
npm run test:rules
```

Expected: concurrency create/rename, legacy adoption i delete/recreate przechodzą.

- [x] **Step 9: Commit**

```bash
git add src/lib/userExercisesService.ts tests/rules/firestore.rules.test.ts scripts/seed-demo.ts
git commit -m "fix: keep user exercise name claims consistent"
```

### Task 3: UI regression, dokumentacja i pełna bramka

**Files:**
- Modify/Test: `src/pages/__tests__/ExercisesPageDataState.test.tsx`
- Modify: `docs/roadmap/ROADMAP.md`
- Modify: `docs/roadmap/specs/2026-07-23-phase-2b-user-exercise-uniqueness-design.md`
- Modify: `docs/roadmap/plans/2026-07-23-phase-2b-user-exercise-uniqueness.md`

**Interfaces:**
- Consumes: niezmieniony komunikat `Ćwiczenie o nazwie "…" już istnieje.`
- Produces: dowód, że formularz pozostaje otwarty i pokazuje błąd

- [x] **Step 1: Dodać targeted UI regression**

W `ExercisesPageDataState.test.tsx` ustawić `createUserExercise.mockRejectedValueOnce(new Error('Ćwiczenie o nazwie "Concurrent Curl" już istnieje.'))`, wysłać formularz i sprawdzić `role="alert"` oraz nadal widoczne pole nazwy.

- [x] **Step 2: Uruchomić targeted unit**

Run:

```bash
npm run test:unit -- src/pages/__tests__/ExercisesPageDataState.test.tsx
```

Expected: PASS bez zmiany produkcyjnego UI, ponieważ formularz już renderuje komunikat serwisu.

- [x] **Step 3: Uruchomić pełne gate’y**

Run:

```bash
npm run test:rules
npm run test:unit
npm run lint
npm run build
git diff --check
```

Expected: wszystkie testy, lint, build i diff check przechodzą.

- [x] **Step 4: Wykonać focused review**

Sprawdzić pełny diff od `6b79e53` pod kątem:

- wyścigu create i rename;
- stale claim po delete;
- zachowania legacy ID;
- odczytu claimów innego użytkownika;
- ominięcia claimu przez direct create/update;
- niezmienionego `exerciseSource: 'user'`;
- braku migracji i zmian historycznych referencji.

- [x] **Step 5: Zaktualizować lifecycle**

Po przejściu review oznaczyć 2B jako `DONE`, zapisać wyniki gate’ów i lokalnej obserwacji błędu duplikatu. Faza S oraz Faza 7 pozostają osobnymi obowiązkami.

- [x] **Step 6: Commit**

```bash
git add src/pages/__tests__/ExercisesPageDataState.test.tsx docs/roadmap
git commit -m "docs: close phase 2b verification"
```

## Execution

Plan jest wykonywany inline w tej sesji przez `superpowers:executing-plans`; subagenci nie są potrzebni, ponieważ wszystkie zadania zmieniają ten sam invariant i te same pliki.

## Closeout

- RED/GREEN: direct create, równoległe create/rename, legacy adoption, delete/recreate oraz próby usunięcia/przepięcia claimu zostały odtworzone i zabezpieczone.
- Commity wykonawcze: `fe6660f`, `4424871`, `86b6adb`.
- Publiczne sygnatury serwisu pozostały bez parametru `database`; testy emulatorowe podmieniają moduł produkcyjnego `db`, więc planowany punkt wstrzykiwania nie trafił do API aplikacji.
- Post-integration gate: 468 unitów, 16 testów reguł, lint, build i `git diff --check` — PASS.
- Focused review pełnego diffu od `6b79e53`: bez otwartych P0/P1/P2.
- Visual evidence: Browser na lokalnych emulatorach zwrócił otwarty dialog z wartością `Concurrent Curl` i widocznym alertem duplikatu po drugim zapisie.
- Integracja lokalna: fast-forward do `puls-rebrand` na `86b6adb`. Push, deploy i publikacja reguł produkcyjnych nie zostały wykonane.
- Następny zakres: Faza S; następnie Faza 7 / `RELEASE-08`.
