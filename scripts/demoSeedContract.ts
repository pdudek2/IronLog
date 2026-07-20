export interface DemoSeedConfirmation {
  actualEmail: string
  expectedEmail: string
  actualProjectId: string
  confirmedEmail?: string
  confirmedProjectId?: string
}

export interface DemoSeedSnapshot {
  workoutCount: number
  templateCount: number
  userExerciseCount: number
  readinessCount: number
  maxDurationMin: number
  blankWorkoutLabels: number
  hasActiveSession: boolean
}

export interface DemoSeedExpectations {
  workoutCount: number
  templateCount: number
  userExerciseCount: number
  readinessCount: number
  maxDurationMin: number
}

const EXPECTED_DEMO_PROJECT_ID = 'ironlog-ede05'

export function assertDemoSeedConfirmation(input: DemoSeedConfirmation): void {
  if (!input.expectedEmail) {
    throw new Error('Oczekiwane konto demo nie jest skonfigurowane.')
  }
  if (!input.confirmedEmail) {
    throw new Error('Potwierdzenie emaila jest wymagane.')
  }
  if (input.actualEmail !== input.expectedEmail) {
    throw new Error('Konto Firebase Auth nie pasuje do oczekiwanego konta demo.')
  }
  if (input.confirmedEmail !== input.expectedEmail) {
    throw new Error('Potwierdzony email nie pasuje do oczekiwanego konta demo.')
  }

  if (!input.confirmedProjectId) {
    throw new Error('Potwierdzenie projektu Firebase jest wymagane.')
  }
  if (input.confirmedProjectId !== EXPECTED_DEMO_PROJECT_ID) {
    throw new Error('Potwierdzony projekt nie pasuje do oczekiwanego projektu Firebase.')
  }
  if (input.actualProjectId !== EXPECTED_DEMO_PROJECT_ID) {
    throw new Error('Projekt zainicjalizowanej aplikacji Firebase Admin nie pasuje do oczekiwanego projektu.')
  }
}

export function validateDemoSeedSnapshot(
  snapshot: DemoSeedSnapshot,
  expected: DemoSeedExpectations,
): string[] {
  const issues: string[] = []

  if (snapshot.workoutCount !== expected.workoutCount) {
    issues.push(
      `Liczba treningów: oczekiwano ${expected.workoutCount}, znaleziono ${snapshot.workoutCount}.`,
    )
  }
  if (snapshot.templateCount !== expected.templateCount) {
    issues.push(
      `Liczba szablonów: oczekiwano ${expected.templateCount}, znaleziono ${snapshot.templateCount}.`,
    )
  }
  if (snapshot.userExerciseCount !== expected.userExerciseCount) {
    issues.push(
      `Liczba własnych ćwiczeń: oczekiwano ${expected.userExerciseCount}, znaleziono ${snapshot.userExerciseCount}.`,
    )
  }
  if (snapshot.readinessCount !== expected.readinessCount) {
    issues.push(
      `Liczba ankiet gotowości: oczekiwano ${expected.readinessCount}, znaleziono ${snapshot.readinessCount}.`,
    )
  }
  if (!Number.isFinite(snapshot.maxDurationMin)
    || snapshot.maxDurationMin > expected.maxDurationMin) {
    issues.push(
      `Maksymalny czas treningu: oczekiwano najwyżej ${expected.maxDurationMin} min, znaleziono ${snapshot.maxDurationMin} min.`,
    )
  }
  if (snapshot.blankWorkoutLabels > 0) {
    issues.push(`Treningi z pustą etykietą: ${snapshot.blankWorkoutLabels}.`)
  }
  if (snapshot.hasActiveSession) {
    issues.push('Aktywna sesja nadal istnieje.')
  }

  return issues
}
