# UI Quality Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uczynić analitykę IronLog jednoznaczną na dotyku: jeden wykres siły pokazuje jedno wybrane ćwiczenie, mobile otrzymuje krótki wniosek, a wartości wykresu objętości i heatmapy są dostępne bez hovera.

**Architecture:** Zachować istniejące zapytania i agregaty oparte o `exerciseSessions`. `aggregateStrengthProgression` pozostaje źródłem uporządkowanych, source-aware serii; `ProgressPage` wybiera jedną efektywną serię i filtruje jej punkty bez dodatkowego fetchu. Heatmapa zachowuje zwarty grid, a wartości aktywnych dni udostępnia przez jeden natywny selektor i jawny detail; detal ćwiczenia rozszerza istniejące słupki CSS zamiast wprowadzać drugą bibliotekę wykresów.

**Tech Stack:** React 19, TypeScript, Recharts, CSS, Vitest + Testing Library, Playwright.

**Spec:** [kanoniczna roadmapa UI quality](./2026-08-14-ui-quality-roadmap.md), etap 3; zatwierdzona decyzja z 2026-08-17: jedno wybrane ćwiczenie naraz, domyślnie najczęściej wykonywane, bez normalizacji.

## Global Constraints

- Scope lineage: `roadmapa UI quality → etap 3 → etapy 4–5 oraz decyzje B-02, M-07, M-14 pozostają otwarte`.
- Jedna linia wykresu siły reprezentuje dokładnie jedno source-aware ćwiczenie: klucz `${exerciseSource}:${exerciseId}`.
- Domyślny wybór to najczęściej wykonywane ćwiczenie z bieżącego zakresu; remisy muszą być deterministyczne.
- Nie normalizować ciężarów między ćwiczeniami i nie dodawać wspólnej skali porównawczej.
- Nie zmieniać zapytań Firestore, limitów danych, materializacji, `exerciseSource`, rekordów ani lifecycle treningu.
- Nie dodawać zależności, komponentu wykresu ani globalnego store; użyć istniejącego Recharts, lokalnego stanu i natywnego `<select>`.
- Istotne wartości muszą być widoczne bez hovera; kontrolki dotykowe zachowują minimum 44×44 px i istniejący focus ring.
- Puste i krótkie serie danych mają jawny stan, a zmiana zakresu nie może pozostawić nieważnego wyboru.
- Nie commitować i nie pushować bez osobnego polecenia użytkownika.
- Primary visual surface przy wykonaniu: bezpośrednia, serialna obserwacja w świeżym runtime; Playwright jest kontraktem automatycznym, nie zamiennikiem obserwacji.

## File map

- `src/lib/progressService.ts` — uporządkowany katalog wszystkich ważonych serii w zakresie; opcjonalny limit zachowuje kompatybilność istniejących wywołań.
- `src/lib/__tests__/progressService.test.ts` — regresje kompletności, kolejności i source-aware kluczy.
- `src/pages/ProgressPage.tsx` — efektywny wybór ćwiczenia, jedna linia, summary trendu, selektor aktywnego dnia heatmapy i znaczniki miesięcy.
- `src/pages/__tests__/ProgressPage.test.tsx` — kontrakty selektora, jednej linii, fallbacku, krótkiej serii, insightu i heatmapy.
- `src/pages/ExerciseDetailPage.tsx` — większy wykres objętości oraz widoczne wartości ostatnia/maksymalna.
- `src/pages/__tests__/ExerciseDetailCatalogState.test.tsx` — kolejność słupków, jawne wartości i accessible summary.
- `src/index.css` — lokalne style kontrolek, insightu, heatmapy i słupków; bez zmian tokenów.
- `tests/e2e/support/progressEmulator.ts` — druga source-aware seria potrzebna do realnego przełączenia.
- `tests/e2e/progress.spec.ts` — desktop/mobile selector, jedna linia, insight i heatmap detail.
- `tests/e2e/exercise-detail.spec.ts` — nowy, wąski kontrakt detalu ćwiczenia; obecne E2E nie pokrywają tej trasy.

---

### Task 1: Pełny, deterministyczny katalog serii siłowych

**Files:**
- Modify: `src/lib/progressService.ts`
- Modify: `src/lib/__tests__/progressService.test.ts`

**Interfaces:**
- Consumes: `ProgressSessionLite[]`, source-aware key `${exerciseSource}:${exerciseId}` i `bestSetWeight > 0`.
- Produces: `aggregateStrengthProgression(sessions, limit?)` zwracające wszystkie serie przy braku limitu, posortowane po częstotliwości, nazwie i kluczu; `data` zachowuje obecny `StrengthPoint[]`.

- [x] **Step 1: Dodać regresję kompletności i deterministycznego defaultu**

W `src/lib/__tests__/progressService.test.ts` dodać:

```ts
it('returns every weighted exercise ordered by frequency with source-aware keys', () => {
  const result = aggregateStrengthProgression([
    session({ daysAgo: 6, exerciseId: 'bench', exerciseName: 'Bench Press' }),
    session({ daysAgo: 5, exerciseId: 'bench', exerciseName: 'Bench Press' }),
    session({ daysAgo: 4, exerciseId: 'squat', exerciseName: 'Squat' }),
    session({ daysAgo: 3, exerciseId: 'row', exerciseName: 'Row' }),
    session({ daysAgo: 2, exerciseId: 'curl', exerciseName: 'Curl' }),
    session({ daysAgo: 1, exerciseId: 'deadlift', exerciseName: 'Deadlift' }),
    session({ daysAgo: 0, exerciseSource: 'user', exerciseId: 'bench', exerciseName: 'Bench Press' }),
  ])

  expect(result.series.map(({ key }) => key)).toEqual([
    'global:bench',
    'user:bench',
    'global:curl',
    'global:deadlift',
    'global:row',
    'global:squat',
  ])
})

it('keeps the optional series limit for bounded callers', () => {
  const result = aggregateStrengthProgression([
    session({ daysAgo: 3, exerciseId: 'bench', exerciseName: 'Bench Press' }),
    session({ daysAgo: 2, exerciseId: 'row', exerciseName: 'Row' }),
    session({ daysAgo: 1, exerciseId: 'squat', exerciseName: 'Squat' }),
  ], 2)

  expect(result.series).toHaveLength(2)
})
```

- [x] **Step 2: Uruchomić test i potwierdzić porażkę**

Run:

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/lib/__tests__/progressService.test.ts
```

Expected: pierwszy test FAIL, bo obecny default ucina katalog do pięciu i nie rozstrzyga remisów jawnie.

- [x] **Step 3: Uczynić limit opcjonalnym i ustabilizować ranking**

W `src/lib/progressService.ts` zmienić sygnaturę oraz ranking bez nowego helpera:

```ts
export function aggregateStrengthProgression(
  sessions: ProgressSessionLite[],
  limit?: number,
): { data: StrengthPoint[]; series: StrengthSeries[] } {
  // istniejące zliczanie pozostaje bez zmian

  const rankedExercises = [...exerciseCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count
      || a[1].name.localeCompare(b[1].name, 'pl')
      || a[0].localeCompare(b[0]))

  const selectedExercises = limit === undefined
    ? rankedExercises
    : rankedExercises.slice(0, limit)
```

W dalszej części funkcji zastąpić lokalne `topExercises` przez `selectedExercises`; nie zmieniać kształtu punktów ani source-aware kluczy.

- [x] **Step 4: Uruchomić test serwisu**

Run: komenda ze Step 2.

Expected: PASS; istniejący test rozdzielenia global/user nadal przechodzi.

### Task 2: Jedna seria, selektor i krótka odpowiedź o trendzie

**Files:**
- Modify: `src/pages/ProgressPage.tsx`
- Modify: `src/pages/__tests__/ProgressPage.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: uporządkowane `strengthData.series` z Task 1 oraz `StrengthPoint[]`.
- Produces: lokalny `selectedStrengthKey`, wyliczony `effectiveStrengthKey`, `selectedStrengthSeries`, `selectedStrengthPoints` i jeden `<Line>`; widoczny insight opisuje ostatni, maksymalny i zmianę względem pierwszego top setu w zakresie.

- [ ] **Step 1: Dodać regresję wyboru jednej source-aware serii**

Zastąpić test oczekujący dwóch linii w `ProgressPage.test.tsx` kontraktem:

```tsx
it('renders one strength series and switches it with a source-aware selector', async () => {
  mockLoadProgressData.mockResolvedValue(successfulLoad({
    sessions: [
      session('global-1', 4, { bestSetWeight: 70 }),
      session('global-2', 3, { bestSetWeight: 75 }),
      session('global-3', 2, { bestSetWeight: 80 }),
      session('user-1', 3, {
        exerciseSource: 'user',
        exerciseId: 'row',
        exerciseName: 'Wiosłowanie własne',
        bestSetWeight: 55,
      }),
      session('user-2', 1, {
        exerciseSource: 'user',
        exerciseId: 'row',
        exerciseName: 'Wiosłowanie własne',
        bestSetWeight: 60,
      }),
    ],
  }))

  render(<ProgressPage />)

  const selector = await screen.findByRole('combobox', { name: 'Ćwiczenie na wykresie' })
  expect(selector).toHaveValue('global:bench')
  expect(screen.getAllByTestId('strength-line')).toHaveLength(1)
  expect(screen.getByTestId('strength-line')).toHaveAttribute('data-data-key', 'global:bench')
  expect(screen.getByText('Ostatnio 80 kg')).toBeInTheDocument()
  expect(screen.getByText('+10 kg względem pierwszego w zakresie')).toBeInTheDocument()

  fireEvent.change(selector, { target: { value: 'user:row' } })

  expect(screen.getAllByTestId('strength-line')).toHaveLength(1)
  expect(screen.getByTestId('strength-line')).toHaveAttribute('data-data-key', 'user:row')
  expect(screen.getByText('Ostatnio 60 kg')).toBeInTheDocument()
})
```

- [ ] **Step 2: Dodać regresję fallbacku i krótkiej serii**

W tym samym pliku dodać:

```tsx
it('falls back to the most frequent valid series and evaluates readiness per exercise', async () => {
  mockLoadProgressData.mockResolvedValue(successfulLoad({
    sessions: [
      session('bench-1', 3),
      session('bench-2', 2),
      session('bench-3', 1),
      session('row-1', 1, {
        exerciseId: 'row',
        exerciseName: 'Wiosłowanie',
        bestSetWeight: 50,
      }),
    ],
  }))

  render(<ProgressPage />)
  const selector = await screen.findByRole('combobox', { name: 'Ćwiczenie na wykresie' })
  fireEvent.change(selector, { target: { value: 'global:row' } })

  expect(screen.getByText('Potrzebujesz jeszcze 2 dni z zapisanym ciężarem do wykresu.')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '30 dni' }))
  expect(selector).toHaveValue(expect.stringMatching(/^global:/))
})
```

- [ ] **Step 3: Uruchomić test strony i potwierdzić porażkę**

Run:

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/pages/__tests__/ProgressPage.test.tsx
```

Expected: FAIL, bo wykres renderuje wiele linii, nie ma selektora i ocenia próg trzech dni wspólnie dla wszystkich ćwiczeń.

- [ ] **Step 4: Dodać minimalny lokalny wybór i derivations**

W `ProgressPage` dodać tylko stan użytkownika:

```ts
const [selectedStrengthKey, setSelectedStrengthKey] = useState<string | null>(null)
```

Po `strengthData` wyliczyć bez `setState` w efekcie:

```ts
const effectiveStrengthKey = strengthData.series.some(({ key }) => key === selectedStrengthKey)
  ? selectedStrengthKey
  : strengthData.series[0]?.key ?? null
const selectedStrengthSeries = strengthData.series.find(({ key }) => key === effectiveStrengthKey) ?? null
const selectedStrengthPoints = effectiveStrengthKey
  ? strengthData.data.filter((point) => Number(point[effectiveStrengthKey] ?? 0) > 0)
  : []
const selectedStrengthValues = effectiveStrengthKey
  ? selectedStrengthPoints.map((point) => Number(point[effectiveStrengthKey] ?? 0))
  : []
const firstStrength = selectedStrengthValues[0] ?? 0
const latestStrength = selectedStrengthValues.at(-1) ?? 0
const maxStrength = selectedStrengthValues.length ? Math.max(...selectedStrengthValues) : 0
const strengthDelta = latestStrength - firstStrength
const missingStrengthSessions = Math.max(0, 3 - selectedStrengthPoints.length)
```

Nie zapisywać wyboru do Zustand/localStorage; wybór jest lokalny dla bieżącej analizy.

- [ ] **Step 5: Zastąpić wiele linii jednym selektorem i jednym `<Line>`**

W nagłówku panelu dodać natywny select:

```tsx
<label className="progress-strength-picker">
  <span>Ćwiczenie</span>
  <select
    aria-label="Ćwiczenie na wykresie"
    value={effectiveStrengthKey ?? ''}
    onChange={(event) => setSelectedStrengthKey(event.target.value)}
  >
    {strengthData.series.map((series) => (
      <option key={series.key} value={series.key}>{series.exerciseName}</option>
    ))}
  </select>
</label>
```

Warunek krótkiej serii oprzeć na `selectedStrengthPoints.length`. `LineChart` otrzymuje `selectedStrengthPoints`, a w środku renderuje wyłącznie:

```tsx
{selectedStrengthSeries && (
  <Line
    type="monotone"
    dataKey={selectedStrengthSeries.key}
    name={selectedStrengthSeries.exerciseName}
    stroke="var(--accent)"
    strokeWidth={2.35}
    dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }}
  />
)}
```

Usunąć `.progress-legend`; selektor jest jedynym identyfikatorem serii.

- [ ] **Step 6: Dodać jawny insight przed gęstą analityką**

Przed `.progress-analysis-grid` wyrenderować dla kompletnej wybranej serii:

```tsx
{selectedStrengthSeries && selectedStrengthPoints.length >= 3 && (
  <section className="progress-strength-insight" aria-label="Trend wybranego ćwiczenia">
    <div>
      <span>{selectedStrengthSeries.exerciseName}</span>
      <strong>Ostatnio {latestStrength} kg</strong>
    </div>
    <p>
      {strengthDelta > 0
        ? `+${strengthDelta} kg względem pierwszego w zakresie`
        : strengthDelta < 0
          ? `${strengthDelta} kg względem pierwszego w zakresie`
          : 'Bez zmiany względem pierwszego w zakresie'}
      {' · '}maks. {maxStrength} kg
    </p>
  </section>
)}
```

W CSS utrzymać płaską powierzchnię, minimum 12 px dla etykiet i ustawić `select` na minimum `2.75rem` wysokości. Insight ma być widoczny przed wykresami na mobile i nie może dublować wielkiego hero.

- [ ] **Step 7: Uruchomić test strony**

Run: komenda ze Step 3.

Expected: PASS; dokładnie jedna linia, poprawny source-aware wybór i jawny short-series state.

### Task 3: Heatmapa z czasem i wartością odzyskiwalną na dotyku

**Files:**
- Modify: `src/pages/ProgressPage.tsx`
- Modify: `src/pages/__tests__/ProgressPage.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: istniejące `HeatmapDay[]` z datą, `weekIndex`, `volume` i `level`.
- Produces: `heatmapMonthLabels`, uporządkowane `activeHeatmapDays`, lokalny `selectedHeatmapDate`, natywny selektor aktywnego dnia i jawny detail; grid pozostaje nieinteraktywną reprezentacją.

- [x] **Step 1: Dodać test znaczników miesięcy i dotykowego odczytu**

Do testu heatmapy w `ProgressPage.test.tsx` dodać:

```tsx
const dayPicker = await screen.findByRole('combobox', { name: 'Sprawdź dzień w kalendarzu' })
expect(dayPicker).toHaveStyle({ minHeight: '44px' })
expect(screen.getByLabelText('Miesiące kalendarza')).not.toBeEmptyDOMElement()

fireEvent.change(dayPicker, { target: { value: '2026-07-07' } })
expect(screen.getByRole('status')).toHaveTextContent('7 lip · 1.0k kg')
```

Jeśli min-height jest wyłącznie w CSS, zamiast inline style sprawdzić klasę `.progress-heatmap-picker` w unit, a geometrię 44 px zostawić E2E.

- [x] **Step 2: Uruchomić test i potwierdzić porażkę**

Run:

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/pages/__tests__/ProgressPage.test.tsx
```

Expected: FAIL, bo daty istnieją tylko w `title`, a heatmapa nie pokazuje miesięcy ani selektora.

- [x] **Step 3: Wyliczyć miesiące i aktywne dni bez nowego modułu**

W `ProgressPage` dodać:

```ts
const activeHeatmapDays = useMemo(
  () => heatmapData.filter((cell) => cell.date && cell.volume > 0).sort((a, b) => b.date.localeCompare(a.date)),
  [heatmapData],
)
const [selectedHeatmapDate, setSelectedHeatmapDate] = useState<string | null>(null)
const effectiveHeatmapDate = activeHeatmapDays.some(({ date }) => date === selectedHeatmapDate)
  ? selectedHeatmapDate
  : activeHeatmapDays[0]?.date ?? null
const selectedHeatmapDay = activeHeatmapDays.find(({ date }) => date === effectiveHeatmapDate) ?? null
const heatmapMonthLabels = Array.from({ length: 12 }, (_, weekIndex) => {
  const monday = heatmapData.find((cell) => cell.weekIndex === weekIndex && cell.dayOfWeek === 0 && cell.date)
  if (!monday) return ''
  const month = new Date(`${monday.date}T12:00:00`).toLocaleDateString('pl-PL', { month: 'short' })
  const previous = weekIndex > 0
    ? heatmapData.find((cell) => cell.weekIndex === weekIndex - 1 && cell.dayOfWeek === 0 && cell.date)
    : null
  const previousMonth = previous
    ? new Date(`${previous.date}T12:00:00`).toLocaleDateString('pl-PL', { month: 'short' })
    : ''
  return weekIndex === 0 || month !== previousMonth ? month : ''
})
```

Nie dodawać klikanych mikroskopijnych komórek; jeden natywny select zapewnia prawidłowy cel dotykowy bez poziomego scrolla 84 przycisków.

- [x] **Step 4: Dodać widoczne znaczniki i detail**

Nad gridem dodać `.progress-heatmap-months` z `aria-label="Miesiące kalendarza"` i 12 kolumnami zgodnymi z tygodniami. Pod summary dodać:

```tsx
{activeHeatmapDays.length > 0 && (
  <div className="progress-heatmap-inspector">
    <label>
      <span>Sprawdź dzień</span>
      <select
        className="progress-heatmap-picker"
        aria-label="Sprawdź dzień w kalendarzu"
        value={effectiveHeatmapDate ?? ''}
        onChange={(event) => setSelectedHeatmapDate(event.target.value)}
      >
        {activeHeatmapDays.map((day) => (
          <option key={day.date} value={day.date}>
            {formatHeatmapDate(day.date)}
          </option>
        ))}
      </select>
    </label>
    {selectedHeatmapDay && (
      <p role="status">
        {formatHeatmapDate(selectedHeatmapDay.date)} · {formatVolume(selectedHeatmapDay.volume)}
      </p>
    )}
  </div>
)}
```

CSS: minimum 44 px dla selecta, 12 px dla istotnych etykiet, brak nowej karty; grid i inspector pozostają częścią jednego panelu.

- [x] **Step 5: Uruchomić test heatmapy**

Run: komenda ze Step 2.

Expected: PASS; wartość jest odczytywalna bez hovera, a `title` może pozostać jako desktop enhancement.

### Task 4: Czytelny wykres objętości w szczegółach ćwiczenia

**Files:**
- Modify: `src/pages/ExerciseDetailPage.tsx`
- Modify: `src/pages/__tests__/ExerciseDetailCatalogState.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: maksymalnie 10 `ExerciseSession[]` posortowanych malejąco przez serwis.
- Produces: `chronologicalSessions`, jawne `latestVolume`/`maxVolume`, accessible summary i węższe słupki o celowej szerokości.

- [x] **Step 1: Dodać regresję wartości bez hovera i kolejności**

W `ExerciseDetailCatalogState.test.tsx` ustawić trzy sesje o wolumenie 900, 1200 i 1000 kg, a następnie oczekiwać:

```tsx
expect(await screen.findByRole('heading', { name: 'Wolumen na sesję' })).toBeInTheDocument()
expect(screen.getByText('Ostatnio')).toHaveTextContent('Ostatnio')
expect(screen.getByText('900 kg')).toBeInTheDocument()
expect(screen.getByText('Maksimum')).toHaveTextContent('Maksimum')
expect(screen.getByText('1.2k kg')).toBeInTheDocument()

const bars = screen.getAllByTestId('exercise-volume-bar')
expect(bars.map((bar) => bar.getAttribute('aria-label'))).toEqual([
  expect.stringContaining('1.0k kg'),
  expect.stringContaining('1.2k kg'),
  expect.stringContaining('900 kg'),
])
```

- [x] **Step 2: Uruchomić test i potwierdzić porażkę**

Run:

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/pages/__tests__/ExerciseDetailCatalogState.test.tsx
```

Expected: FAIL, bo wartości są dostępne wyłącznie przez `title`, a słupki nie mają semantycznego opisu.

- [x] **Step 3: Wyliczyć jawne metryki i uporządkować dane**

W `ExerciseDetailPage` zastąpić wielokrotne `slice().reverse()` jedną wartością:

```ts
const chronologicalSessions = useMemo(() => [...sessions].reverse(), [sessions])
const latestVolume = sessions[0]?.totalVolume ?? 0
const maxVolume = sessions.length ? Math.max(...sessions.map((session) => session.totalVolume), 1) : 1
```

Nad słupkami dodać płaski summary:

```tsx
<div className="exercise-detail-volume-summary">
  <p><span>Ostatnio</span><strong>{formatVolume(latestVolume)}</strong></p>
  <p><span>Maksimum</span><strong>{formatVolume(maxVolume)}</strong></p>
</div>
```

- [x] **Step 4: Zastąpić rozciągnięte słupki celową geometrią**

Użyć klas zamiast `flex-1`:

```tsx
<div
  className="exercise-detail-volume-chart"
  role="img"
  aria-label={`Wolumen ostatnich ${chronologicalSessions.length} sesji. Ostatnio ${formatVolume(latestVolume)}. Maksimum ${formatVolume(maxVolume)}.`}
>
  {chronologicalSessions.map((session) => (
    <div key={session.id} className="exercise-detail-volume-column">
      <div className="exercise-detail-volume-track">
        <motion.div
          data-testid="exercise-volume-bar"
          aria-label={`${formatDate(session.startedAt)}: ${formatVolume(session.totalVolume)}`}
          className="exercise-detail-volume-bar"
          style={{ background: accent, height: `${Math.max((session.totalVolume / maxVolume) * 100, 4)}%` }}
        />
      </div>
      <span>{new Date(session.startedAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'numeric' })}</span>
    </div>
  ))}
</div>
```

CSS: wysokość wykresu minimum 9rem, `grid-template-columns: repeat(auto-fit, minmax(1.25rem, 2rem))`, kontrolowana przerwa, etykiety minimum 12 px i brak zależności od `.group`/hover.

- [x] **Step 5: Uruchomić test detalu**

Run: komenda ze Step 2.

Expected: PASS; visible latest/max oraz chronologiczne słupki.

### Task 5: Runtime contracts, assurance i closeout etapu 3

**Files:**
- Modify: `tests/e2e/support/progressEmulator.ts`
- Modify: `tests/e2e/progress.spec.ts`
- Create: `tests/e2e/exercise-detail.spec.ts`
- Modify: `output/plans/2026-08-14-ui-quality-roadmap.md`
- Modify: `output/plans/2026-08-17-ui-quality-phase-3-implementation.md`

**Interfaces:**
- Consumes: Tasks 1–4 i emulator Auth/Firestore.
- Produces: realne przełączenie dwóch serii, geometryczne gate’y mobile, touch inspector heatmapy, jawne wartości detalu oraz kwalifikowany visual receipt.

- [ ] **Step 1: Rozszerzyć seed o drugie ćwiczenie**

W `progressEmulator.ts` dodać trzy sesje `Phase 7 Squat` z source-aware id `${PREFIX}squat`, wagami 100/105/110 kg i oddzielnymi `workoutId`. Dodać ich referencje do `cleanupProgressEmulatorState`; nie tworzyć dodatkowego rekordu, jeśli test go nie potrzebuje.

- [ ] **Step 2: Dodać E2E pojedynczej linii i selektora**

W `progress.spec.ts` dodać:

```ts
test('shows one selected strength exercise and switches it without comparing scales', async ({ page }) => {
  await useHistoricalSessionClock(page)
  await gotoProgressReady(page)

  const picker = page.getByRole('combobox', { name: 'Ćwiczenie na wykresie' })
  await expect(picker).toHaveValue(/bench/)
  await expect(page.locator('.recharts-line')).toHaveCount(1)
  await expect(page.getByLabel('Trend wybranego ćwiczenia')).toContainText('Phase 7 Bench Press')

  await picker.selectOption({ label: 'Phase 7 Squat' })
  await expect(page.locator('.recharts-line')).toHaveCount(1)
  await expect(page.getByLabel('Trend wybranego ćwiczenia')).toContainText('Ostatnio 110 kg')
})
```

- [ ] **Step 3: Rozszerzyć mobile E2E o insight i heatmapę**

W istniejącym mobile teście sprawdzić:

```ts
const insight = page.getByLabel('Trend wybranego ćwiczenia')
const firstChart = page.locator('.progress-chart-frame').first()
await expect(insight).toBeVisible()
expect((await insight.boundingBox())!.y).toBeLessThan((await firstChart.boundingBox())!.y)

const heatmapPicker = page.getByRole('combobox', { name: 'Sprawdź dzień w kalendarzu' })
expect((await heatmapPicker.boundingBox())!.height).toBeGreaterThanOrEqual(44)
await heatmapPicker.selectOption({ index: 1 })
await expect(page.locator('.progress-heatmap-inspector [role="status"]')).not.toBeEmpty()
```

Zastąpić stary kontrakt legendy kontraktem selektora; legenda po Task 2 nie istnieje.

- [ ] **Step 4: Dodać runtime contract detalu ćwiczenia**

Na desktop i mobile sprawdzić, że summary `Ostatnio`/`Maksimum` jest widoczne, `.exercise-detail-volume-chart` nie ma poziomego overflow, a wysokość wykresu wynosi co najmniej 144 px. Nie używać hovera do odczytu tych dwóch wartości.

- [ ] **Step 5: Uruchomić targetowane testy**

Run:

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run \
  src/lib/__tests__/progressService.test.ts \
  src/pages/__tests__/ProgressPage.test.tsx \
  src/pages/__tests__/ExerciseDetailCatalogState.test.tsx
```

Run:

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e \
firebase emulators:exec --only auth,firestore --project demo-ironlog \
"npx playwright test tests/e2e/progress.spec.ts tests/e2e/exercise-detail.spec.ts --project=desktop --project=mobile"
```

- [ ] **Step 6: Uruchomić pełne gate’y**

Run:

```bash
npm run lint
NODE_OPTIONS=--no-experimental-webstorage npm run test:unit
npm run build
git diff --check
```

Expected: wszystkie PASS. Znany teardown `Firestore Listen net::ERR_ABORTED` raportować jako infrastrukturę tylko wtedy, gdy asercje produktu przechodzą i błąd występuje po zamknięciu strony; nie wyciszać go zmianą aplikacji.

- [ ] **Step 7: Wykonać bezpośrednią obserwację serialną**

Po ostatniej zmianie obejrzeć w jednym świeżym runtime:

1. Progress desktop 1440 px — domyślnie najczęstsze ćwiczenie, jedna linia, zmiana selektora aktualizuje linię i insight;
2. Progress mobile 320 i 393 px — insight przed wykresami, selektory minimum 44 px, brak poziomego overflow;
3. heatmapa — znaczniki miesięcy i wybrana wartość widoczna po dotyku bez hovera;
4. detail ćwiczenia desktop/mobile — większy wykres, węższe słupki, widoczne ostatnio/maksimum;
5. krótkie i puste serie — celowy stan bez pustej osi lub fałszywego trendu.

Przed wyborem surface przeczytać `project-convergence/references/visual-observation.md`. Receipt `Observed` wymaga ukończonego wywołania primary surface z finalnym screenshotem/stem; inaczej zapisać `Pending` z konkretnym blockerem.

- [ ] **Step 8: Zamknąć wyłącznie etap 3 po integracji**

Zaktualizować parent roadmap i ten receipt. Etapy 4–5 oraz decyzje B-02, M-07 i M-14 pozostają otwarte; następny etap 4 należy rozbić na osobne release slices Coach, Historia/listy oraz shell/404.

## Self-review planu

- Spec coverage: pojedyncza seria, selector/default, detal ćwiczenia, mobile insight, heatmapa touch/time, zakresy i stany krótkie/puste mają osobne taski i gate’y.
- Approved decision: plan nie wprowadza normalizacji ani porównania różnych skal; selektor zmienia jedyną renderowaną serię.
- Scope control: zero nowych zapytań, kolekcji, zależności, store’ów i komponentów wykresowych.
- Accessibility: wartości krytyczne są widoczne bez hovera; natywne selecty mają 44 px; mikroskopijne pola heatmapy nie udają przycisków.
- Type consistency: `StrengthPoint`, `StrengthSeries`, `HeatmapDay` i source-aware keys pozostają zgodne z obecnym serwisem.
- Placeholder scan: brak nierozstrzygniętych kroków; E2E detalu ma jedną, sprawdzoną ścieżkę `tests/e2e/exercise-detail.spec.ts`.
