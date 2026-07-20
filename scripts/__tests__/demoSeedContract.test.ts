import { describe, expect, it } from 'vitest'
import {
  assertDemoSeedConfirmation,
  validateDemoSeedSnapshot,
  type DemoSeedConfirmation,
  type DemoSeedExpectations,
  type DemoSeedSnapshot,
} from '../demoSeedContract.js'

const confirmation: DemoSeedConfirmation = {
  actualEmail: 'demo@ironlog.app',
  expectedEmail: 'demo@ironlog.app',
  actualProjectId: 'ironlog-ede05',
  confirmedEmail: 'demo@ironlog.app',
  confirmedProjectId: 'ironlog-ede05',
}

const expected: DemoSeedExpectations = {
  workoutCount: 26,
  templateCount: 1,
  userExerciseCount: 4,
  readinessCount: 7,
  maxDurationMin: 74,
}

const snapshot: DemoSeedSnapshot = {
  ...expected,
  blankWorkoutLabels: 0,
  hasActiveSession: false,
}

describe('assertDemoSeedConfirmation', () => {
  it('rejects a missing email confirmation', () => {
    expect(() => assertDemoSeedConfirmation({
      ...confirmation,
      confirmedEmail: undefined,
    })).toThrow('Potwierdzenie emaila jest wymagane.')
  })

  it('rejects an email confirmation for another account', () => {
    expect(() => assertDemoSeedConfirmation({
      ...confirmation,
      confirmedEmail: 'other@ironlog.app',
    })).toThrow('Potwierdzony email nie pasuje do oczekiwanego konta demo.')
  })

  it('rejects an authenticated account different from the expected demo account', () => {
    expect(() => assertDemoSeedConfirmation({
      ...confirmation,
      actualEmail: 'other@ironlog.app',
    })).toThrow('Konto Firebase Auth nie pasuje do oczekiwanego konta demo.')
  })

  it('rejects a missing Firebase project confirmation', () => {
    expect(() => assertDemoSeedConfirmation({
      ...confirmation,
      confirmedProjectId: undefined,
    })).toThrow('Potwierdzenie projektu Firebase jest wymagane.')
  })

  it('rejects a Firebase project confirmation for another project', () => {
    expect(() => assertDemoSeedConfirmation({
      ...confirmation,
      confirmedProjectId: 'other-project',
    })).toThrow('Potwierdzony projekt nie pasuje do oczekiwanego projektu Firebase.')
  })

  it('rejects an initialized Firebase Admin app for another project', () => {
    expect(() => assertDemoSeedConfirmation({
      ...confirmation,
      actualProjectId: 'other-project',
    })).toThrow('Projekt zainicjalizowanej aplikacji Firebase Admin nie pasuje do oczekiwanego projektu.')
  })

  it('accepts only the correct account and Firebase project pair', () => {
    expect(() => assertDemoSeedConfirmation(confirmation)).not.toThrow()
  })
})

describe('validateDemoSeedSnapshot', () => {
  it('accepts a snapshot matching the explicit fixture expectations', () => {
    expect(validateDemoSeedSnapshot(snapshot, expected)).toEqual([])
  })

  it('reports a wrong workout count', () => {
    expect(validateDemoSeedSnapshot({ ...snapshot, workoutCount: 25 }, expected)).toEqual([
      'Liczba treningów: oczekiwano 26, znaleziono 25.',
    ])
  })

  it('reports a workout duration above the fixture maximum', () => {
    expect(validateDemoSeedSnapshot({ ...snapshot, maxDurationMin: 75 }, expected)).toEqual([
      'Maksymalny czas treningu: oczekiwano najwyżej 74 min, znaleziono 75 min.',
    ])
  })

  it('reports blank workout labels', () => {
    expect(validateDemoSeedSnapshot({ ...snapshot, blankWorkoutLabels: 1 }, expected)).toEqual([
      'Treningi z pustą etykietą: 1.',
    ])
  })

  it('reports a missing template', () => {
    expect(validateDemoSeedSnapshot({ ...snapshot, templateCount: 0 }, expected)).toEqual([
      'Liczba szablonów: oczekiwano 1, znaleziono 0.',
    ])
  })

  it('reports missing custom exercises', () => {
    expect(validateDemoSeedSnapshot({ ...snapshot, userExerciseCount: 0 }, expected)).toEqual([
      'Liczba własnych ćwiczeń: oczekiwano 4, znaleziono 0.',
    ])
  })

  it('reports missing readiness entries', () => {
    expect(validateDemoSeedSnapshot({ ...snapshot, readinessCount: 0 }, expected)).toEqual([
      'Liczba ankiet gotowości: oczekiwano 7, znaleziono 0.',
    ])
  })

  it('reports an active session left after reset', () => {
    expect(validateDemoSeedSnapshot({ ...snapshot, hasActiveSession: true }, expected)).toEqual([
      'Aktywna sesja nadal istnieje.',
    ])
  })

  it('returns every validation issue instead of stopping at the first one', () => {
    const issues = validateDemoSeedSnapshot({
      workoutCount: 0,
      templateCount: 0,
      userExerciseCount: 0,
      readinessCount: 0,
      maxDurationMin: 120,
      blankWorkoutLabels: 2,
      hasActiveSession: true,
    }, expected)

    expect(issues).toHaveLength(7)
  })
})
