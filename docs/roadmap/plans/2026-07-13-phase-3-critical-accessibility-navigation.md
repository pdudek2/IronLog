# Phase 3 Critical Accessibility and Navigation Implementation Plan

**Status:** COMPLETED — INTEGRATED LOCALLY TO `puls-rebrand`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Usunąć potwierdzone bariery `A11Y-01–08`, tak aby główne przepływy IronLog były poprawnie nazwane, fokusowalne i komunikowały stan bez polegania na kolorze.

**Architecture:** Poprawki pozostają lokalne w istniejących komponentach i preferują natywną semantykę HTML oraz proste `aria-pressed`, `aria-current`, `aria-describedby` i `inert`. Regresje chronią celowane testy komponentowe, osobny Playwright `accessibility.spec.ts` i ukierunkowany smoke `@axe-core/playwright`; nie powstaje nowy framework kontrolek dostępnościowych.

**Tech Stack:** React 19, TypeScript, Vite, Vitest 4, Testing Library, Playwright 1.59, `@axe-core/playwright`, Firebase Auth/Firestore emulators.

## Global Constraints

- Zakres implementacyjny jest zamknięty do `A11Y-01`, `A11Y-02`, `A11Y-03`, `A11Y-04`, `A11Y-05`, `A11Y-06`, `A11Y-07`, `A11Y-08`.
- Kierunek wizualny Puls pozostaje zamrożony; nie zmieniać kolorów, typografii, geometrii ani animacji poza minimalną korektą układu pojedynczej akcji wiersza ćwiczenia.
- Natywna semantyka HTML ma pierwszeństwo przed ARIA; nie dodawać ARIA kosmetycznie.
- Przyciski wyboru pozostają natywnymi przyciskami w nazwanych grupach i komunikują stan przez `aria-pressed`; nie wdrażać generycznego `ToggleGroup`, tabs ani listbox.
- Błędy ogólne są ogłaszane, ale tylko błąd konkretnego pola może ustawić temu polu `aria-invalid` i `aria-describedby`.
- Zachować istniejące kontrakty `AppLayout` focus-on-route-change oraz `useDialogA11y`: focus trap, Escape, initial focus i focus restore.
- Automatyczny Axe jest celowany w reguły Fazy 3 i nie jest nazywany pełnym audytem WCAG 2.2 AA.
- Nie zmieniać klasyfikacji błędów AI, lifecycle streamu, copy CTA treningu, rozmiarów touch targetów ani zachowania edytora na mobile; należą do kolejnych faz.
- Nie zmieniać Firestore, API, danych demo ani produkcji. Nie wykonywać pushu, deployu ani czynności `RELEASE-08`.
- Testy E2E nie mogą używać prawdziwego Claude API ani prywatnego live konta; używać lokalnego storage, route interception lub emulatorów.
- Statusy i identyfikatory w kodzie pozostają po angielsku; polskie teksty należą do UI.
- Każde zadanie kończy się focused testem i osobnym commitem bez AI co-author trailerów.

---

## File map

| Plik | Odpowiedzialność w Fazie 3 |
|---|---|
| `src/components/ui/Input.tsx` | dostępne ogłaszanie komunikatu błędu pola |
| `src/components/ConfirmDialog.tsx` | osobne ID tytułu i opisu dialogu |
| `src/pages/TemplateEditorPage.tsx` | etykiety nazwy planu/dni i kontekstowa nazwa usuwania ćwiczenia |
| `src/pages/ExercisesPage.tsx` | nazwane grupy filtrów, partie mięśniowe, błędy pola i pojedyncza akcja otwarcia |
| `src/components/ExercisePicker.tsx` | nazwany i stanowy filtr kategorii |
| `src/components/AiKeyPanel.tsx` | etykieta modelu, status ładowania oraz dostępny błąd modeli |
| `src/pages/ChatPage.tsx` | tryb AI, błędy, walidacja celu i wybór dnia podglądu |
| `src/components/BottomNav.tsx` | `inert`, `aria-hidden`, bezpieczne wyprowadzenie fokusu i bieżący trening |
| `src/components/TopNav.tsx` | `aria-current` profilu |
| `src/pages/__tests__/SharedAccessibilityContracts.test.tsx` | deterministyczny kontrakt `Input` i `ConfirmDialog` |
| `src/pages/__tests__/TemplateEditorAccessibility.test.tsx` | accessible names edytora i przycisku kosza |
| `src/pages/__tests__/ExercisesPageDataState.test.tsx` | semantyka filtrów, formularza i jednej akcji otwarcia |
| `src/pages/__tests__/ChatPageAccessibility.test.tsx` | semantyka AI bez prawdziwego API |
| `tests/e2e/accessibility.spec.ts` | runtime klawiatury, nawigacji, objętych powierzchni i Axe |
| `package.json`, `package-lock.json` | `@axe-core/playwright` i lokalny skrypt bramki a11y |
| `docs/roadmap/ROADMAP.md` | zamknięcie zakresu po pełnej weryfikacji |
| `docs/roadmap/specs/2026-07-13-phase-3-critical-accessibility-navigation-design.md` | wynik wdrożenia i dowody |
| `WORKING_CONTEXT.md` | aktualny focus, passing/untested i następna faza |

## Spec coverage

| Wymaganie | Zadanie wdrożeniowe | Dowód |
|---|---:|---|
| `A11Y-01` | Task 5 | mobile focus-cycle Playwright + Axe `aria-hidden-focus` |
| `A11Y-02`, `A11Y-03` | Task 2 | focused DOM test edytora |
| `A11Y-04` | Tasks 3–4 | focused DOM tests grup, `aria-pressed` i Axe |
| `A11Y-05` | Tasks 1, 3–4 | field/error tests, model/AI tests i Axe |
| `A11Y-06` | Task 1 | dialog name/description + focus behavior |
| `A11Y-07` | Task 3 | dokładnie jedna nazwana akcja otwarcia |
| `A11Y-08` | Task 5 | desktop/mobile `aria-current` Playwright |

---

### Task 1: Shared field-error and dialog contracts

**Files:**
- Create: `src/pages/__tests__/SharedAccessibilityContracts.test.tsx`
- Modify: `src/components/ui/Input.tsx`
- Modify: `src/components/ConfirmDialog.tsx`

**Interfaces:**
- Consumes: istniejące `InputProps.error: string | undefined`; istniejące `ConfirmDialogProps` i `useDialogA11y`.
- Produces: błąd `Input` jako element `role="alert"` połączony przez istniejące `aria-describedby`; dialog z `aria-labelledby=<titleId>` i `aria-describedby=<descriptionId>`.

- [x] **Step 1: Write the failing shared accessibility tests**

Utwórz `src/pages/__tests__/SharedAccessibilityContracts.test.tsx`:

```tsx
import { createElement, useState, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ConfirmDialog from '../../components/ConfirmDialog'
import Input from '../../components/ui/Input'

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  motion: new Proxy({}, {
    get: (_target, tag: string | symbol) => {
      if (typeof tag !== 'string') return undefined
      return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
        delete props.initial
        delete props.animate
        delete props.exit
        delete props.transition
        delete props.whileTap
        return createElement(tag, props, children)
      }
    },
  }),
}))

function DialogHarness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Usuń plan</button>
      {open && (
        <ConfirmDialog
          title="Usunąć plan?"
          message="Tej operacji nie można cofnąć."
          confirmLabel="Usuń"
          cancelLabel="Anuluj"
          onConfirm={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  )
}

describe('shared accessibility contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('announces and describes an Input error', () => {
    render(
      <>
        <label htmlFor="api-key">Klucz API</label>
        <Input id="api-key" error="Klucz jest za krótki" />
      </>,
    )

    const input = screen.getByRole('textbox', { name: 'Klucz API' })
    const alert = screen.getByRole('alert')

    expect(alert).toHaveTextContent('Klucz jest za krótki')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Klucz jest za krótki')
  })

  it('names and describes the dialog while preserving focus behavior', async () => {
    render(<DialogHarness />)

    const trigger = screen.getByRole('button', { name: 'Usuń plan' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'Usunąć plan?' })
    const cancel = screen.getByRole('button', { name: 'Anuluj' })
    const confirm = screen.getByRole('button', { name: 'Usuń', exact: true })

    expect(dialog).toHaveAccessibleDescription('Tej operacji nie można cofnąć.')
    expect(cancel).toHaveFocus()

    confirm.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(cancel).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })
})
```

- [x] **Step 2: Run the tests and verify the semantic assertions fail**

Run:

```bash
npx vitest run src/pages/__tests__/SharedAccessibilityContracts.test.tsx --project dom
```

Expected: FAIL because the `Input` error is not an alert and `ConfirmDialog` has no accessible description. Focus assertions may already pass and must remain green after the fix.

- [x] **Step 3: Add the minimal field-error and dialog semantics**

W `src/components/ui/Input.tsx` zmień render komunikatu na:

```tsx
{error && (
  <p id={errorId} role="alert" className="ui-field-error">
    {error}
  </p>
)}
```

W `src/components/ConfirmDialog.tsx` dodaj drugi identyfikator:

```tsx
const titleId = useId()
const descriptionId = useId()
```

Połącz opis z dialogiem:

```tsx
role="dialog"
aria-modal="true"
aria-labelledby={titleId}
aria-describedby={descriptionId}
tabIndex={-1}
```

Nadaj ID treści:

```tsx
<p
  id={descriptionId}
  className="mb-6 text-sm leading-relaxed"
  style={{ color: 'var(--muted)' }}
>
  {message}
</p>
```

Nie zmieniaj hooka `useDialogA11y` ani kolejności przycisków.

- [x] **Step 4: Run the focused tests**

Run:

```bash
npx vitest run src/pages/__tests__/SharedAccessibilityContracts.test.tsx --project dom
```

Expected: 2 tests PASS.

- [x] **Step 5: Commit Task 1**

```bash
git add src/components/ui/Input.tsx src/components/ConfirmDialog.tsx src/pages/__tests__/SharedAccessibilityContracts.test.tsx
git commit -m "fix: expose shared accessibility semantics"
```

---

### Task 2: Template editor labels and contextual actions

**Files:**
- Create: `src/pages/__tests__/TemplateEditorAccessibility.test.tsx`
- Modify: `src/pages/TemplateEditorPage.tsx`

**Interfaces:**
- Consumes: stabilne `DraftDay._id`, `TemplateExercise.name`, `DraftDay.name` i istniejący draft AI.
- Produces: textbox `Nazwa`, textbox `Dzień N` i przycisk `Usuń ćwiczenie <exercise> z dnia <day>`.

- [x] **Step 1: Write a failing editor accessibility test**

Utwórz `src/pages/__tests__/TemplateEditorAccessibility.test.tsx`:

```tsx
import { createElement, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TemplateEditorPage from '../TemplateEditorPage'

const mocks = vi.hoisted(() => ({
  getUserExercises: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1' } }),
}))
vi.mock('../../lib/userExercisesService', () => ({
  getUserExercises: mocks.getUserExercises,
}))
vi.mock('../../lib/templateDraftStorage', () => ({
  readTemplateDraft: () => ({
    name: 'Upper / Lower',
    days: [{
      name: 'Upper A',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: 4,
        targetReps: 8,
        targetWeight: 60,
      }],
    }],
  }),
  clearTemplateDraft: vi.fn(),
}))
vi.mock('../../lib/templateService', () => ({
  createTemplate: vi.fn(),
  getTemplate: vi.fn(),
  updateTemplate: vi.fn(),
}))
vi.mock('../../components/ExercisePicker', () => ({ default: () => null }))
vi.mock('../../components/ConfirmDialog', () => ({ default: () => null }))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mocks.navigate }
})
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_target, tag: string | symbol) => {
      if (typeof tag !== 'string') return undefined
      return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
        delete props.initial
        delete props.animate
        delete props.transition
        delete props.whileTap
        return createElement(tag, props, children)
      }
    },
  }),
}))

describe('TemplateEditorPage accessibility', () => {
  beforeEach(() => {
    mocks.getUserExercises.mockReset()
    mocks.getUserExercises.mockResolvedValue([])
    mocks.navigate.mockReset()
  })

  it('labels the plan and day names and gives delete action full context', async () => {
    render(
      <MemoryRouter initialEntries={['/templates/new?draft=ai']}>
        <TemplateEditorPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('textbox', { name: 'Nazwa' })).toHaveValue('Upper / Lower')
    expect(screen.getByRole('textbox', { name: 'Dzień 1' })).toHaveValue('Upper A')
    expect(screen.getByRole('button', {
      name: 'Usuń ćwiczenie Bench Press z dnia Upper A',
    })).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run the test and verify it fails**

Run:

```bash
npx vitest run src/pages/__tests__/TemplateEditorAccessibility.test.tsx --project dom
```

Expected: FAIL because the two textboxes have no labels and the trash button has no accessible name.

- [x] **Step 3: Connect visible editor labels to stable input IDs**

W `src/pages/TemplateEditorPage.tsx` zamień panel nazwy na:

```tsx
<section className="template-name-panel">
  <label htmlFor="template-name" className="planner-kicker">Nazwa</label>
  <input
    id="template-name"
    type="text"
    value={name}
    onChange={(event) => setName(event.target.value)}
    placeholder="np. Upper / Lower 4 dni"
    className="w-full rounded-[var(--radius-lg)] px-4 py-3 text-sm outline-none text-white"
    style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
  />
</section>
```

Na początku callbacku `days.map` utwórz stabilne wartości:

```tsx
{days.map((day, dayIndex) => {
  const dayNameInputId = `template-day-name-${day._id}`
  const dayDisplayName = day.name.trim() || `Dzień ${dayIndex + 1}`

  return (
    <section key={day._id} className="template-day-editor">
```

Zastąp tekst i input dnia:

```tsx
<label htmlFor={dayNameInputId} className="planner-kicker">
  Dzień {dayIndex + 1}
</label>
<input
  id={dayNameInputId}
  type="text"
  value={day.name}
  onChange={(event) => updateDay(dayIndex, { ...day, name: event.target.value })}
  className="mt-3 w-full rounded-[var(--radius-lg)] px-4 py-3 text-sm outline-none text-white"
  style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
/>
```

Domknij callback `days.map` przez `)})` po sekcji dnia, zachowując istniejącą strukturę.

- [x] **Step 4: Give the trash button exercise and day context**

Do ikonowego przycisku usuwania ćwiczenia dodaj:

```tsx
aria-label={`Usuń ćwiczenie ${exercise.name} z dnia ${dayDisplayName}`}
```

Ikonę oznacz dekoracyjnie:

```tsx
<Trash2 size={13} aria-hidden="true" />
```

- [x] **Step 5: Run focused editor tests**

Run:

```bash
npx vitest run src/pages/__tests__/TemplateEditorAccessibility.test.tsx --project dom
npx vitest run src/pages/__tests__/TemplatesPageDataState.test.tsx --project dom
```

Expected: both files PASS.

- [x] **Step 6: Commit Task 2**

```bash
git add src/pages/TemplateEditorPage.tsx src/pages/__tests__/TemplateEditorAccessibility.test.tsx
git commit -m "fix: label template editor controls"
```

---

### Task 3: Exercise filters, form feedback, and a single open action

**Files:**
- Modify: `src/pages/__tests__/ExercisesPageDataState.test.tsx`
- Modify: `src/pages/ExercisesPage.tsx`
- Modify: `src/components/ExercisePicker.tsx`

**Interfaces:**
- Consumes: `ChipRow<T>`, `ExerciseCard`, `CreateExerciseForm`, picker category state and existing Puls classes.
- Produces: named filter groups, `aria-pressed` selection state, field-specific exercise-name errors and one `Otwórz ćwiczenie <name>` action per row.

- [x] **Step 1: Add failing filter, form, and row-action tests**

W `src/pages/__tests__/ExercisesPageDataState.test.tsx` rozszerz import:

```tsx
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
```

Dodaj testy wewnątrz istniejącego `describe`:

```tsx
it('exposes filter state and exactly one open action per exercise', async () => {
  mocks.getUserExercises.mockResolvedValueOnce([])
  render(<ExercisesPage />)

  const muscleGroup = await screen.findByRole('group', { name: 'Partia' })
  const equipmentGroup = screen.getByRole('group', { name: 'Sprzęt' })
  const allMuscles = within(muscleGroup).getByRole('button', { name: 'Wszystkie' })
  const chest = within(muscleGroup).getByRole('button', { name: 'Klatka' })

  expect(allMuscles).toHaveAttribute('aria-pressed', 'true')
  expect(chest).toHaveAttribute('aria-pressed', 'false')
  expect(within(equipmentGroup).getByRole('button', { name: 'Wszystkie' }))
    .toHaveAttribute('aria-pressed', 'true')

  fireEvent.click(chest)
  expect(chest).toHaveAttribute('aria-pressed', 'true')
  expect(allMuscles).toHaveAttribute('aria-pressed', 'false')

  fireEvent.click(allMuscles)
  expect(screen.getAllByRole('button', { name: 'Otwórz ćwiczenie Przysiad' })).toHaveLength(1)
})

it('announces only a field-specific name validation error and exposes muscle state', async () => {
  mocks.getUserExercises.mockResolvedValueOnce([])
  render(<ExercisesPage />)

  fireEvent.click(await screen.findByRole('button', { name: 'Dodaj własne' }))
  const dialog = screen.getByRole('dialog', { name: 'Dodaj własne ćwiczenie' })
  const name = within(dialog).getByRole('textbox', { name: 'Nazwa *' })
  const muscles = within(dialog).getByRole('group', { name: 'Partie mięśniowe' })
  const chest = within(muscles).getByRole('button', { name: 'Klatka' })

  expect(chest).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(chest)
  expect(chest).toHaveAttribute('aria-pressed', 'true')

  fireEvent.click(within(dialog).getByRole('button', { name: 'Dodaj ćwiczenie' }))
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Nazwa musi mieć co najmniej 2 znaki.')
  expect(name).toHaveAttribute('aria-invalid', 'true')
  expect(name).toHaveAccessibleDescription('Nazwa musi mieć co najmniej 2 znaki.')
})
```

- [x] **Step 2: Run the tests and verify they fail for the intended contracts**

Run:

```bash
npx vitest run src/pages/__tests__/ExercisesPageDataState.test.tsx --project dom
```

Expected: existing data-state tests PASS; new tests FAIL because groups and pressed states are missing, the exercise row has duplicate navigation actions, and the form error is not associated with the name field.

- [x] **Step 3: Make `ChipRow` named and stateful**

Rozszerz props i komponent w `src/pages/ExercisesPage.tsx`:

```tsx
interface ChipRowProps<T extends string> {
  label: string
  options: T[]
  labels: Record<T, string>
  active: T
  onSelect: (value: T) => void
}

function ChipRow<T extends string>({ label, options, labels, active, onSelect }: ChipRowProps<T>) {
  return (
    <div className="exercise-chip-row" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onSelect(option)}
          className="exercise-filter-chip"
          data-active={active === option}
          aria-pressed={active === option}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  )
}
```

Wywołania zmień na:

```tsx
<ChipRow label="Partia" options={CATEGORIES} labels={CATEGORY_LABELS} active={category} onSelect={setCategory} />
<ChipRow label="Sprzęt" options={EQUIPMENT_OPTIONS} labels={EQUIPMENT_LABELS} active={equipment} onSelect={setEquipment} />
```

- [x] **Step 4: Distinguish field and general errors in `CreateExerciseForm`**

Dodaj typ obok props formularza:

```ts
interface ExerciseFormError {
  message: string
  field: 'name' | null
}
```

Zmień stan i dodaj ID:

```tsx
const [error, setError] = useState<ExerciseFormError | null>(null)
const errorId = useId()
```

Zmień walidację i zapis:

```tsx
if (trimmed.length < 2) {
  setError({ message: 'Nazwa musi mieć co najmniej 2 znaki.', field: 'name' })
  return
}
setSaving(true)
setError(null)
try {
  await onSubmit({ name: trimmed, category, equipment, muscles })
} catch (nextError) {
  setError({
    message: nextError instanceof Error ? nextError.message : 'Błąd zapisu. Spróbuj ponownie.',
    field: null,
  })
  setSaving(false)
}
```

Pole nazwy uzupełnij:

```tsx
onChange={(event) => {
  setName(event.target.value)
  if (error?.field === 'name') setError(null)
}}
aria-invalid={error?.field === 'name' ? true : undefined}
aria-describedby={error?.field === 'name' ? errorId : undefined}
```

Przycisk partii uzupełnij:

```tsx
aria-pressed={active}
```

Komunikat zmień na:

```tsx
{error && (
  <p id={errorId} role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>
    {error.message}
  </p>
)}
```

- [x] **Step 5: Collapse duplicate exercise navigation into one accessible action**

W `ExerciseCard` nadaj głównej akcji jednoznaczną nazwę:

```tsx
<button
  type="button"
  onClick={onNavigate}
  className="exercise-library-row-main"
  aria-label={`Otwórz ćwiczenie ${exercise.name}`}
>
  <span>{isUser ? 'Moje' : CATEGORY_LABELS[exercise.category]}</span>
  <strong>{exercise.name}</strong>
  <small>{EQUIPMENT_LABELS[exercise.equipment]}</small>
</button>
```

Końcowy przycisk `.exercise-library-open` zastąp nieinteraktywnym elementem dekoracyjnym w tej samej komórce gridu:

```tsx
<span className="exercise-library-open" aria-hidden="true">
  <ChevronRight size={16} />
</span>
```

Zachowaj `.exercise-library-muscles`, `.exercise-library-actions` i istniejący CSS bez zmian. Chevron pozostaje wizualnie w tym samym miejscu, ale nie tworzy drugiej akcji w Tab ani accessibility tree.

- [x] **Step 6: Expose picker category state**

W `src/components/ExercisePicker.tsx` nazwij grupę:

```tsx
<div
  className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3 sm:px-5"
  style={{ borderBottom: '1px solid var(--border)' }}
  role="group"
  aria-label="Kategoria ćwiczenia"
>
```

Każdy przycisk kategorii uzupełnij:

```tsx
type="button"
aria-pressed={category === c.value}
```

- [x] **Step 7: Run focused tests and lint the touched files**

Run:

```bash
npx vitest run src/pages/__tests__/ExercisesPageDataState.test.tsx --project dom
npx eslint src/pages/ExercisesPage.tsx src/components/ExercisePicker.tsx src/pages/__tests__/ExercisesPageDataState.test.tsx
```

Expected: all ExercisesPage tests PASS; ESLint exits 0.

- [x] **Step 8: Commit Task 3**

```bash
git add src/pages/ExercisesPage.tsx src/components/ExercisePicker.tsx src/pages/__tests__/ExercisesPageDataState.test.tsx
git commit -m "fix: expose exercise selection semantics"
```

---
### Task 4: AI model, mode, validation, and preview semantics

**Files:**
- Create: `src/pages/__tests__/ChatPageAccessibility.test.tsx`
- Modify: `src/components/AiKeyPanel.tsx`
- Modify: `src/pages/ChatPage.tsx`

**Interfaces:**
- Consumes: `AiKeyPanel` configuration lifecycle, `GeneratedTrainingPlan`, existing `SectionError` and button groups.
- Produces: combobox `Model Claude`, alert `modelsError`, group `Tryb AI Coacha`, group `Dzień podglądu planu` and field-specific `PlanErrorState`.

- [x] **Step 1: Write deterministic AI accessibility tests**

Utwórz `src/pages/__tests__/ChatPageAccessibility.test.tsx`:

```tsx
import { createElement, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatPage from '../ChatPage'

const mocks = vi.hoisted(() => ({
  fetchAvailableClaudeModels: vi.fn(),
  generateTrainingPlan: vi.fn(),
  streamChatReply: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1', email: 'user@example.com' } }),
}))
vi.mock('../../lib/aiKeyStorage', () => ({
  clearClaudeApiKey: vi.fn(),
  clearClaudeModel: vi.fn(),
  getClaudeApiKey: () => 'sk-ant-test-key-longer-than-twenty-characters',
  getClaudeModel: () => 'claude-test',
  hasClaudeApiKey: () => true,
  setClaudeApiKey: (value: string) => value.trim(),
  setClaudeModel: (value: string) => value.trim(),
}))
vi.mock('../../lib/chatService', () => ({
  fetchAvailableClaudeModels: mocks.fetchAvailableClaudeModels,
  generateTrainingPlan: mocks.generateTrainingPlan,
  streamChatReply: mocks.streamChatReply,
}))
vi.mock('../../lib/templateService', () => ({ createTemplate: vi.fn() }))
vi.mock('../../lib/templateDraftStorage', () => ({ saveTemplateDraft: vi.fn() }))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mocks.navigate }
})
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}))
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_target, tag: string | symbol) => {
      if (typeof tag !== 'string') return undefined
      return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
        delete props.initial
        delete props.animate
        delete props.transition
        delete props.whileTap
        return createElement(tag, props, children)
      }
    },
  }),
}))

describe('ChatPage accessibility', () => {
  beforeEach(() => {
    mocks.fetchAvailableClaudeModels.mockReset()
    mocks.fetchAvailableClaudeModels.mockResolvedValue([
      { id: 'claude-test', label: 'Claude Test' },
    ])
    mocks.generateTrainingPlan.mockReset()
    mocks.streamChatReply.mockReset()
    mocks.navigate.mockReset()
  })

  it('labels the model, exposes mode state, and links goal validation', async () => {
    render(<ChatPage />)

    expect(await screen.findByRole('combobox', { name: 'Model Claude' })).toHaveValue('claude-test')

    const modeGroup = screen.getByRole('group', { name: 'Tryb AI Coacha' })
    const chatMode = within(modeGroup).getByRole('button', { name: /Rozmowa/ })
    const planMode = within(modeGroup).getByRole('button', { name: /^Plan/ })
    expect(chatMode).toHaveAttribute('aria-pressed', 'true')
    expect(planMode).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(planMode)
    expect(planMode).toHaveAttribute('aria-pressed', 'true')

    const goal = screen.getByRole('textbox', { name: 'Cel planu' })
    fireEvent.click(screen.getByRole('button', { name: 'Generuj plan' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Podaj cel planu, zanim uruchomisz generator.')
    expect(goal).toHaveAttribute('aria-invalid', 'true')
    expect(goal).toHaveAccessibleDescription('Podaj cel planu, zanim uruchomisz generator.')
  })

  it('exposes the selected generated-plan day without relying on color', async () => {
    mocks.generateTrainingPlan.mockResolvedValueOnce({
      name: 'Plan testowy',
      summary: 'Dwa dni',
      days: [
        { name: 'Upper', exercises: [] },
        { name: 'Lower', exercises: [] },
      ],
    })
    render(<ChatPage />)

    await screen.findByRole('combobox', { name: 'Model Claude' })
    fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Cel planu' }), {
      target: { value: 'Siła' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generuj plan' }))

    const dayGroup = await screen.findByRole('group', { name: 'Dzień podglądu planu' })
    const upper = within(dayGroup).getByRole('button', { name: 'Upper' })
    const lower = within(dayGroup).getByRole('button', { name: 'Lower' })
    expect(upper).toHaveAttribute('aria-pressed', 'true')
    expect(lower).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(lower)
    expect(lower).toHaveAttribute('aria-pressed', 'true')
    expect(upper).toHaveAttribute('aria-pressed', 'false')
  })

  it('announces and associates a model-list failure', async () => {
    mocks.fetchAvailableClaudeModels.mockRejectedValueOnce(new Error('Nie udało się pobrać modeli Claude.'))
    render(<ChatPage />)

    const model = await screen.findByRole('combobox', { name: 'Model Claude' })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Nie udało się pobrać modeli Claude.')
    expect(model).toHaveAttribute('aria-invalid', 'true')
    expect(model).toHaveAccessibleDescription('Nie udało się pobrać modeli Claude.')
  })

  it('keeps the API key name stable while announcing its field error', async () => {
    render(<ChatPage />)

    await screen.findByRole('combobox', { name: 'Model Claude' })
    const key = screen.getByLabelText('Twój klucz', { selector: 'input' })
    fireEvent.change(key, { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zaktualizuj klucz' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Klucz wygląda na zbyt krótki.')
    expect(key).toHaveAccessibleName('Twój klucz')
    expect(key).toHaveAttribute('aria-invalid', 'true')
    expect(key).toHaveAccessibleDescription(/Klucz wygląda na zbyt krótki/)
  })
})
```

- [x] **Step 2: Run the tests and verify the intended failures**

Run:

```bash
npx vitest run src/pages/__tests__/ChatPageAccessibility.test.tsx --project dom
```

Expected: FAIL because the model select is unnamed, mode/day buttons lack `aria-pressed`, and error regions/field associations are incomplete.

- [x] **Step 3: Label the model select and connect its status/error**

W `src/components/AiKeyPanel.tsx` importuj `useId`:

```tsx
import { useEffect, useId, useMemo, useState } from 'react'
```

Dodaj wewnątrz komponentu:

```tsx
const keyInputId = useId()
const modelSelectId = useId()
const modelsErrorId = useId()
```

Zastąp zewnętrzny `<label className="flex flex-col gap-2">` pola klucza zwykłym kontenerem, a widoczny tekst połącz z `Input`:

```tsx
<div className="flex flex-col gap-2">
  <label htmlFor={keyInputId} className="stat-meta">Twój klucz</label>
  <div className="flex flex-col gap-3 sm:flex-row">
    <Input
      id={keyInputId}
      type={showKey ? 'text' : 'password'}
      placeholder="Wklej Claude API key"
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value)
        setSaved(false)
        if (error) setError('')
      }}
      error={error}
      autoComplete="off"
      spellCheck={false}
      className="w-full"
    />

    <div className="flex gap-2 sm:flex-none">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setShowKey((current) => !current)}
        aria-label={showKey ? 'Ukryj klucz' : 'Pokaż klucz'}
        className="flex-1 sm:flex-none"
      >
        {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
      </Button>

      <Button
        type="button"
        variant="ghost"
        onClick={handleClear}
        disabled={!hasSavedKey && draft.length === 0}
        aria-label="Usuń lokalnie zapisany klucz"
        className="flex-1 sm:flex-none"
      >
        <Trash2 size={15} />
      </Button>
    </div>
  </div>
</div>
```

Nie pozostawiaj komunikatu `Input.error` wewnątrz `<label>`, ponieważ stałby się częścią accessible name pola zamiast wyłącznie opisem.

Widoczny tekst modelu zamień na label:

```tsx
<label htmlFor={modelSelectId} className="text-sm font-semibold text-white">
  Model Claude
</label>
```

Status ładowania oznacz:

```tsx
<span role="status" className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
  Ładowanie...
</span>
```

Select uzupełnij:

```tsx
id={modelSelectId}
aria-invalid={modelsError ? true : undefined}
aria-describedby={modelsError ? modelsErrorId : undefined}
```

Komunikat błędu zmień na:

```tsx
{modelsError && (
  <p id={modelsErrorId} role="alert" className="mt-3 text-xs leading-5" style={{ color: 'var(--danger)' }}>
    {modelsError}
  </p>
)}
```

- [x] **Step 4: Introduce a field-aware plan error contract**

W `src/pages/ChatPage.tsx` importuj `useId`:

```tsx
import { useEffect, useId, useRef, useState } from 'react'
```

Dodaj typ obok `AiWorkspaceTab`:

```ts
interface PlanErrorState {
  message: string
  field: 'goal' | null
}
```

Rozszerz `SectionError`:

```tsx
function SectionError({ message, id }: { message: string; id?: string }) {
  return (
    <div
      id={id}
      role="alert"
      className="rounded-[var(--radius-lg)] border px-4 py-3 text-sm"
      style={{
        background: 'var(--danger-soft)',
        borderColor: 'var(--danger-soft-strong)',
        color: 'var(--danger)',
      }}
    >
      {message}
    </div>
  )
}
```

Zmień stan i dodaj ID:

```tsx
const [planError, setPlanError] = useState<PlanErrorState | null>(null)
const planGoalId = useId()
const planErrorId = useId()
```

Zastąp ustawienia stanu:

```tsx
setPlanError({ message: 'Dodaj Claude API key, żeby odblokować generator planu.', field: null })
setPlanError({ message: 'Podaj cel planu, zanim uruchomisz generator.', field: 'goal' })
setPlanError(null)
setPlanError({ message, field: null })
setPlanError({ message: 'Nie udało się zapisać wygenerowanego planu.', field: null })
```

Nie zmieniaj `error` używanego przez czat; `SectionError` zacznie go ogłaszać dzięki `role="alert"`.

- [x] **Step 5: Expose AI mode, goal, and preview-day state**

Kontener trybu uzupełnij:

```tsx
<section className="coach-mode-switch" role="group" aria-label="Tryb AI Coacha">
```

Każdy przycisk trybu uzupełnij:

```tsx
aria-pressed={active}
```

Pole celu zmień na:

```tsx
<label htmlFor={planGoalId} className="coach-field md:col-span-2">
  <span className="stat-meta">Cel planu</span>
  <input
    id={planGoalId}
    type="text"
    value={planGoal}
    onChange={(event) => {
      setPlanGoal(event.target.value)
      if (planError?.field === 'goal') setPlanError(null)
    }}
    aria-invalid={planError?.field === 'goal' ? true : undefined}
    aria-describedby={planError?.field === 'goal' ? planErrorId : undefined}
    placeholder="Np. upper/lower pod siłę i prostą progresję"
  />
</label>
```

Render błędu zmień na:

```tsx
{planError && (
  <div className="mt-4">
    <SectionError id={planErrorId} message={planError.message} />
  </div>
)}
```

Kontener dni podglądu uzupełnij:

```tsx
<div className="coach-chip-row mt-5" role="group" aria-label="Dzień podglądu planu">
```

Każdy przycisk dnia uzupełnij:

```tsx
aria-pressed={selectedPreviewDay === index}
```

- [x] **Step 6: Run focused AI and shared tests**

Run:

```bash
npx vitest run src/pages/__tests__/ChatPageAccessibility.test.tsx src/pages/__tests__/SharedAccessibilityContracts.test.tsx --project dom
npx eslint src/pages/ChatPage.tsx src/components/AiKeyPanel.tsx src/pages/__tests__/ChatPageAccessibility.test.tsx
```

Expected: 6 focused tests PASS; ESLint exits 0.

- [x] **Step 7: Commit Task 4**

```bash
git add src/components/AiKeyPanel.tsx src/pages/ChatPage.tsx src/pages/__tests__/ChatPageAccessibility.test.tsx
git commit -m "fix: expose ai control and error state"
```

---

### Task 5: Hidden navigation focus and current-route semantics

**Files:**
- Create: `tests/e2e/accessibility.spec.ts`
- Modify: `src/components/BottomNav.tsx`
- Modify: `src/components/TopNav.tsx`

**Interfaces:**
- Consumes: `BottomNav.navHidden`, shared `main.page-shell[tabindex="-1"]`, current pathname and existing `aria-current` on ordinary nav items.
- Produces: hidden nav `inert + aria-hidden`, no focused descendant, restored interactivity, profile `aria-current="page"` and mobile workout `aria-current="page"`.

- [x] **Step 1: Write failing Playwright navigation contracts**

Utwórz `tests/e2e/accessibility.spec.ts`:

```ts
import { expect, test } from './fixtures'
import { expectAppReady } from './support/appReady'

test.describe('Phase 3 navigation accessibility', () => {
  test('hidden mobile navigation leaves the focus order and returns safely', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only hidden navigation contract')

    await page.goto('/profile')
    await expectAppReady(page, '/profile')

    const nav = page.locator('nav.bottom-nav')
    const start = nav.locator('button[aria-label="Start"]')
    await expect(nav).not.toHaveAttribute('aria-hidden', 'true')

    await page.getByLabel('Imię').focus()
    await expect(nav).toHaveAttribute('aria-hidden', 'true')
    await expect.poll(() => nav.evaluate((element) => (element as HTMLElement).inert)).toBe(true)

    await start.evaluate((element) => element.focus())
    await expect(start).not.toBeFocused()

    await page.getByRole('main').focus()
    await expect(nav).not.toHaveAttribute('aria-hidden', 'true')
    await start.focus()
    await expect(start).toBeFocused()
  })

  test('desktop profile action communicates the current page', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop profile navigation contract')

    await page.goto('/profile')
    await expectAppReady(page, '/profile')
    await expect(page.getByRole('button', { name: 'Profil' })).toHaveAttribute('aria-current', 'page')
  })

  test('mobile workout action communicates the current page', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile workout navigation contract')

    await page.goto('/workout/new')
    await expectAppReady(page, '/workout/new', 25_000)
    await expect(page.locator('nav.bottom-nav').getByRole('button', {
      name: 'Rozpocznij nowy trening',
    })).toHaveAttribute('aria-current', 'page')
  })
})
```

- [x] **Step 2: Run the new E2E file and verify the semantic failures**

Run:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e \
firebase emulators:exec --only auth,firestore --project demo-ironlog \
"npx playwright test tests/e2e/accessibility.spec.ts --project=desktop --project=mobile"
```

Expected: tests fail on missing `inert`, `aria-hidden` and the two missing `aria-current` attributes. Existing browser diagnostics must remain clean.

- [x] **Step 3: Make the hidden mobile nav truly inert**

W `src/components/BottomNav.tsx` wykorzystaj osobny ref na nav:

```tsx
const navRef = useRef<HTMLElement>(null)
```

Po obliczeniu `navHidden` dodaj efekt chroniący aktywny fokus:

```tsx
useEffect(() => {
  if (!navHidden) return

  const activeElement = document.activeElement
  if (!(activeElement instanceof HTMLElement) || !navRef.current?.contains(activeElement)) return

  document.querySelector<HTMLElement>('main.page-shell')?.focus({ preventScroll: true })
}, [navHidden])
```

Element nav uzupełnij:

```tsx
<nav
  ref={navRef}
  aria-label="Nawigacja dolna"
  aria-hidden={navHidden ? true : undefined}
  inert={navHidden}
  className="bottom-nav fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 lg:hidden"
```

Zachowaj istniejące style `transform`, `opacity`, `pointerEvents` i transition. Do `NavBtn` oraz centralnego przycisku treningu dodaj `type="button"`.

- [x] **Step 4: Expose the current profile and workout routes**

W `src/components/TopNav.tsx` do przycisku profilu dodaj:

```tsx
aria-current={current === 'profile' ? 'page' : undefined}
```

W `src/components/BottomNav.tsx` oblicz:

```tsx
const workoutActive = path.startsWith('/workout/new')
```

Do centralnego przycisku treningu dodaj:

```tsx
aria-current={workoutActive ? 'page' : undefined}
```

Nie dodawaj `aria-current` do streaku, wylogowania ani kontrolek niebędących bieżącą lokalizacją.

- [x] **Step 5: Run navigation E2E and existing shell regressions**

Run:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e \
firebase emulators:exec --only auth,firestore --project demo-ironlog \
"npx playwright test tests/e2e/accessibility.spec.ts tests/e2e/protected-shell.spec.ts tests/e2e/smoke.spec.ts --project=desktop --project=mobile"
```

Expected: new navigation tests PASS; existing shell/smoke tests PASS; viewport-specific cases are reported only as intentional skips.

- [x] **Step 6: Commit Task 5**

```bash
git add src/components/BottomNav.tsx src/components/TopNav.tsx tests/e2e/accessibility.spec.ts
git commit -m "fix: remove hidden navigation from focus order"
```

---

### Task 6: Targeted Axe gate and reviewable accessibility snapshots

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/e2e/accessibility.spec.ts`

**Interfaces:**
- Consumes: `expectAppReady`, Playwright projects `desktop`/`mobile`, emulator credentials and all semantics from Tasks 1–5.
- Produces: `npm run test:e2e:a11y`, blocking Phase 3 Axe rule set and per-route `.aria.yml` artifacts for manual review.

- [x] **Step 1: Install the test-only Axe integration**

Run:

```bash
npm install --save-dev @axe-core/playwright
```

Expected: `package.json` and `package-lock.json` change; no runtime dependency is added.

Add this script to `package.json` next to the existing E2E scripts:

```json
"test:e2e:a11y": "E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e firebase emulators:exec --only auth,firestore --project demo-ironlog \"playwright test tests/e2e/accessibility.spec.ts --project=desktop --project=mobile\""
```

- [x] **Step 2: Add the blocking Phase 3 Axe smoke**

Na górze `tests/e2e/accessibility.spec.ts` dodaj:

```ts
import { writeFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
```

Pod importami dodaj:

```ts
const PHASE_3_AXE_RULES = [
  'aria-allowed-attr',
  'aria-command-name',
  'aria-dialog-name',
  'aria-hidden-focus',
  'aria-input-field-name',
  'aria-required-attr',
  'aria-roles',
  'aria-valid-attr-value',
  'button-name',
  'duplicate-id-aria',
  'form-field-multiple-labels',
  'label',
  'nested-interactive',
  'select-name',
] as const

const AXE_ROUTES = [
  '/dashboard',
  '/templates/new',
  '/exercises',
  '/chat',
] as const

function formatViolations(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.flatMap((node) => node.target),
  }))
}
```

Po testach nawigacji dodaj:

```ts
test.describe('Phase 3 targeted Axe smoke', () => {
  for (const route of AXE_ROUTES) {
    test(`${route} has no Phase 3 Axe violations`, async ({ page }) => {
      await page.goto(route)
      await expectAppReady(page, route)

      const results = await new AxeBuilder({ page })
        .withRules([...PHASE_3_AXE_RULES])
        .analyze()

      expect(results.violations, JSON.stringify(formatViolations(results.violations), null, 2))
        .toEqual([])
    })
  }
})
```

Jeżeli TypeScript zgłosi nieistniejącą nazwę reguły, sprawdź listę uruchomieniową zainstalowanego Axe i skoryguj wyłącznie nazwę. Nie usuwaj pokrywanego kontraktu i nie wyłączaj naruszenia `A11Y-01–08`.

- [x] **Step 3: Attach non-golden accessibility snapshots for review**

Dodaj na końcu `tests/e2e/accessibility.spec.ts`:

```ts
test('attaches route accessibility snapshots for manual review', async ({ page }, testInfo) => {
  for (const route of AXE_ROUTES) {
    await page.goto(route)
    await expectAppReady(page, route)

    const regions = {
      navigation: testInfo.project.name === 'mobile'
        ? page.locator('nav.bottom-nav')
        : page.getByRole('navigation', { name: 'Nawigacja główna' }),
      main: page.getByRole('main'),
    }

    for (const [regionName, locator] of Object.entries(regions)) {
      const snapshot = await locator.ariaSnapshot()
      const routeName = route === '/dashboard' ? 'dashboard' : route.slice(1).replaceAll('/', '-')
      const snapshotPath = testInfo.outputPath(`${routeName}-${regionName}.aria.yml`)
      await writeFile(snapshotPath, snapshot, 'utf8')
      await testInfo.attach(`${routeName}-${regionName}.aria.yml`, {
        path: snapshotPath,
        contentType: 'text/yaml',
      })
    }
  }
})
```

Snapshoty są artefaktami testu do ręcznej inspekcji. Nie używaj `toMatchAriaSnapshot()` dla całych stron i nie commituj ich jako kruche goldeny.

- [x] **Step 4: Run the new accessibility gate**

Run:

```bash
npm run test:e2e:a11y
```

Measured: 15 tests PASS (w tym zależny setup uwierzytelnienia) and 4 viewport-specific cases SKIP. Jeżeli Axe zwróci naruszenie, raport musi zawierać ID reguły i selektory; napraw potwierdzone `A11Y-01–08` w odpowiedzialnym komponencie przed ponownym uruchomieniem.

- [x] **Step 5: Inspect the generated semantic evidence**

Run:

```bash
find test-results -type f -name '*.aria.yml' -print
rg -n --glob '*.aria.yml' "navigation|button|textbox|combobox|dialog|alert|pressed|current" test-results
```

Expected: artefakty istnieją dla czterech tras i obu regionów w każdym projekcie; kontrolki objęte Fazą 3 mają nazwy, wybrane przyciski komunikują stan, a snapshot nie pokazuje anonimowego `button`, `textbox` ani `combobox` w objętych powierzchniach.

- [x] **Step 6: Commit Task 6**

```bash
git add package.json package-lock.json tests/e2e/accessibility.spec.ts
git commit -m "test: add critical accessibility gate"
```

---

### Task 7: Full verification, review, and Phase 3 closure

**Stan:** Task 7 zakończony. Steps 1–9 wykonane, final re-review ma wynik `PASS / Approved` (Critical 0, Important 0, Minor 0), implementacja została lokalnie zintegrowana z `puls-rebrand`, a feature branch usunięty.

**Files:**
- Modify: `docs/roadmap/ROADMAP.md`
- Modify: `docs/roadmap/specs/2026-07-13-phase-3-critical-accessibility-navigation-design.md`
- Modify: `docs/roadmap/plans/2026-07-13-phase-3-critical-accessibility-navigation.md`
- Modify: `WORKING_CONTEXT.md`

**Interfaces:**
- Consumes: all Task 1–6 commits, existing verification scripts and generated `.aria.yml` evidence.
- Produces: verified Phase 3 baseline, `DONE` roadmap state and handoff to Phase 4 without changing `RELEASE-08`.

- [x] **Step 1: Run every focused DOM regression**

Run:

```bash
npx vitest run \
  src/pages/__tests__/SharedAccessibilityContracts.test.tsx \
  src/pages/__tests__/TemplateEditorAccessibility.test.tsx \
  src/pages/__tests__/ExercisesPageDataState.test.tsx \
  src/pages/__tests__/ChatPageAccessibility.test.tsx \
  --project dom
```

Measured: 4 files and 15 tests PASS.

- [x] **Step 2: Run the static and full unit gates**

Run:

```bash
npm run lint
npm run test:unit
npm run build
```

Expected:

- ESLint exits 0;
- 38 files and 241 unit/support tests PASS;
- production build exits 0;
- the existing chunk-size warning may remain, because `RELEASE-06` requires measurement before optimization;
- no new warning is introduced by `inert`, ARIA props or test code.

Jeżeli liczba testów zmieni się z powodu zaakceptowanych review fixes, zapisz ponownie zmierzoną wartość w dokumentacji. Końcowy baseline wynosi 241 i każda niższa liczba wymaga wyjaśnienia przed merge.

- [x] **Step 3: Re-run data and workout safety gates**

Run:

```bash
npm run test:rules
npm run test:integration:workout
```

Expected: 10 Firestore rules tests and 20 focused workout integration tests PASS. Phase 3 nie powinna zmienić danych, ale te bramki chronią przed przypadkowym rozszerzeniem diffu.

- [x] **Step 4: Run all emulator-backed browser gates**

Run:

```bash
npm run test:e2e:a11y
npm run test:e2e:isolated
npm run test:e2e:workout
```

Expected:

- Phase 3 accessibility: 15 PASS including auth setup, 4 intentional viewport skips;
- isolated critical gate: 13 PASS;
- workout lifecycle gate: 9 PASS without retry;
- browser diagnostics contain no unexpected console, page or failed-request errors.

- [x] **Step 5: Perform the headed keyboard and snapshot review**

Run:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e \
firebase emulators:exec --only auth,firestore --project demo-ironlog \
"npx playwright test tests/e2e/accessibility.spec.ts --project=desktop --project=mobile --headed"
```

W trakcie kontrolowanego przebiegu potwierdź wizualnie:

1. fokus jest widoczny na top/bottom nav, polach edytora, filtrach, AI i dialogu;
2. mobilna nawigacja znika po fokusie pola i nie przejmuje Tab;
3. po opuszczeniu pola nawigacja wraca i można ją ponownie fokusować;
4. jeden wiersz ćwiczenia ma jedną akcję otwarcia, a edycja/usuwanie pozostają osobne;
5. dialog rozpoczyna na „Anuluj”, zapętla Tab, zamyka się Escape i oddaje fokus;
6. brak wizualnej regresji Puls na 1280×800 i Pixel 5.

Następnie przejrzyj `.aria.yml` komendami ze Step 5 Task 6 i zapisz wynik w specyfikacji. Nie publikuj screenshotów zawierających prywatne dane.

- [x] **Step 6: Request final code review and address findings**

Użyj `superpowers:requesting-code-review` dla pełnego diffu Fazy 3. Review musi sprawdzić:

- zgodność z `A11Y-01–08` i brak rozszerzenia do Faz 4–6;
- poprawność `inert` i brak fokusu wewnątrz `aria-hidden`;
- brak fałszywego `aria-invalid` dla błędów ogólnych;
- brak dwóch akcji otwarcia ćwiczenia;
- wiarygodność Axe gate i brak wyłączeń maskujących naruszenia;
- zachowanie istniejących focus trap/restore i route focus;
- brak zmian danych, backendu i produkcji.

Każde potwierdzone znalezisko napraw w osobnym commicie i ponów właściwy focused test oraz bramkę z Steps 1–4.

Outcome: final re-review `PASS / Approved`; Critical 0, Important 0, Minor 0. Korekty i dodatkowe testy błędów ogólnych są w commicie `04e086e`; pełna bramka unit/support po poprawce przechodzi: 38 plików i 241 testów.

- [x] **Step 7: Close Phase 3 in canonical documentation**

W `docs/roadmap/ROADMAP.md`:

- ustaw datę aktualizacji na `2026-07-13`;
- zmień status wiersza Fazy 3 z `READY` na `DONE`;
- uzupełnij stan przeglądu o zakończoną Fazę 3;
- zaktualizuj baseline unit/support do końcowej zmierzonej wartości `38 plików i 241 testów`;
- pod sekcją Fazy 3 dodaj wynik:

```markdown
**Wynik wdrożenia:** `A11Y-01–08` zostały wdrożone i zweryfikowane. Ukryta dolna nawigacja jest inert, edytor i AI mają trwałe nazwy oraz dostępne błędy, filtry komunikują wybór, dialog ma opis, a wiersz ćwiczenia jedną akcję otwarcia. Ukierunkowany Axe, testy klawiatury i ręczny accessibility snapshot przechodzą na desktopie i mobile. Pełny audyt WCAG oraz ergonomia dotykowa pozostają poza zakresem zgodnie z Fazą 4 i bramką release.
```

- zmień rekomendowaną następną fazę na Fazę 4;
- zachowaj Fazę 2B jako niezależne `READY` i `RELEASE-08` jako `OPEN`.

W `docs/roadmap/specs/2026-07-13-phase-3-critical-accessibility-navigation-design.md` zmień status na:

```markdown
**Status:** wdrożona i zweryfikowana
```

oraz dodaj sekcję:

```markdown
## 17. Wynik wdrożenia

Zakres `A11Y-01–08` został wdrożony bez zmiany kierunku wizualnego Puls. Focused testy komponentowe, ukierunkowany Axe, emulatorowy Playwright, pełny unit/support, lint i build przechodzą. Ręczny keyboard walkthrough oraz accessibility snapshot potwierdziły nazwane kontrolki i prawidłową kolejność fokusu na desktopie i mobile. Produkcyjny live Playwright, deploy Vercel i publikacja reguł pozostają otwarte w `RELEASE-08`.
```

Historyczny payload zamknięcia przed integracją, zapisany w `WORKING_CONTEXT.md` na tym etapie:

- focus: Faza 3 wdrożona, zweryfikowana i po czystym final review na feature branchu, gotowa do merge do `puls-rebrand` po zgodzie użytkownika;
- passing: zmierzone wyniki lint, unit/support, build, Axe, isolated i workout E2E;
- broken: puste;
- untested: nadal live private-account Playwright i produkcyjne czynności `RELEASE-08`;
- next actions: po zgodzie użytkownika zmergować do `puls-rebrand`, następnie zaprojektować i zaplanować Fazę 4; zachować `RELEASE-08` jako otwarte.

W tym planie zaznacz wykonane Tasks 1–7. Nie usuwaj planu; pozostaje audytowalnym zapisem wykonania tak jak plan Fazy 2.

- [x] **Step 8: Verify documentation consistency**

Run:

```bash
rg -n "Faza 3|A11Y-0[1-8]|38 plików|241 testów|Faza 4|RELEASE-08" \
  docs/roadmap/ROADMAP.md \
  docs/roadmap/specs/2026-07-13-phase-3-critical-accessibility-navigation-design.md \
  WORKING_CONTEXT.md
git diff --check
git status --short
```

Expected: Faza 3 jest wszędzie `DONE`/wdrożona, Faza 4 jest następnym focusem, `RELEASE-08` pozostaje otwarte, diff nie ma błędów whitespace, a brak niepowiązanych plików.

- [x] **Step 9: Commit Phase 3 closure**

```bash
git add \
  docs/roadmap/ROADMAP.md \
  docs/roadmap/specs/2026-07-13-phase-3-critical-accessibility-navigation-design.md \
  docs/roadmap/plans/2026-07-13-phase-3-critical-accessibility-navigation.md \
  WORKING_CONTEXT.md
git commit -m "docs: close critical accessibility phase"
```

Po commicie wykonaj `git status --short --branch`. Oczekiwany wynik: czysty feature branch, gotowy do lokalnego fast-forward merge do `puls-rebrand` po zgodzie użytkownika.

---

## Definition of Done

- [x] `A11Y-01–08` mają kod, test i obserwowalny dowód runtime.
- [x] Ukryta dolna nawigacja jest `inert`, `aria-hidden` i nie zawiera aktywnego fokusu.
- [x] Edytor planu, filtry ćwiczeń, picker, formularz ćwiczenia, AI i dialog mają uzgodnioną semantykę.
- [x] Jeden wiersz ćwiczenia ma jedną akcję otwarcia w Tab i accessibility tree.
- [x] `@axe-core/playwright` jest zależnością deweloperską, a `npm run test:e2e:a11y` przechodzi bez maskowania reguł Fazy 3.
- [x] Ręczny headed keyboard walkthrough i `.aria.yml` review są zakończone na desktopie i mobile.
- [x] Lint, 241 unit/support, build, rules, workout integration, isolated E2E, workout E2E i accessibility E2E przechodzą.
- [x] Final code review nie ma otwartych Critical, Important ani Minor findings w zakresie fazy.
- [x] Roadmapa, spec, plan i `WORKING_CONTEXT.md` opisują ten sam stan.
- [x] Brak pushu, deployu i zmian produkcyjnych; `RELEASE-08` pozostaje otwarte.

## Rollback

Nie ma migracji danych ani backendu. Rollback wykonuje się przez cofnięcie commitów Task 6 → Task 1 w odwrotnej kolejności. Jeżeli problem dotyczy wyłącznie bramki Axe, nie cofaj poprawek semantycznych bez reprodukcji regresji; najpierw zweryfikuj nazwę reguły i zakres skanu. Po rollbacku uruchom focused test odpowiedzialnego komponentu, `npm run lint`, `npm run test:unit` i właściwy emulatorowy Playwright.
