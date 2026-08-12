# UI Polish and Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the two verified Polish-content defects and remove the confirmed dead application entry file without changing Puls layout or behavior.

**Architecture:** Reuse the existing plural and date-formatting paths inside their current pages. Keep changes local to the rendering code and existing page tests. Delete the unused `App.tsx` rather than preserving a null component.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, native `Intl` date formatting.

## Global Constraints

- Preserve the Puls design system and all existing layout classes.
- Use `polishPlural`; do not add another plural helper.
- Use native `toLocaleDateString('pl-PL', ...)`; do not add a date dependency.
- Visible heatmap copy, accessible summary, and populated-cell title use the same localized date.
- Delete only files proven unreferenced by repository search and production build.

## File Map

- `src/pages/DashboardPage.tsx`: peak-day set-count copy.
- `src/pages/__tests__/DashboardProjectionStatus.test.tsx`: singular and paucal regression assertions.
- `src/pages/ProgressPage.tsx`: heatmap date formatter and all three date consumers.
- `src/pages/__tests__/ProgressPage.test.tsx`: visible and accessible date assertions.
- `src/App.tsx`: unused null component to delete.

---

### Task 1: Use Polish plural forms for dashboard set counts

**Files:**
- Modify: `src/pages/DashboardPage.tsx:541-545`
- Test: `src/pages/__tests__/DashboardProjectionStatus.test.tsx`

**Interfaces:**
- Consumes: existing `polishPlural(count, singular, paucal, plural)` import.
- Produces: `1 seria`, `2 serie`, and `5 serii` in peak-day copy.

- [ ] **Step 1: Add singular and paucal rendering assertions**

Use current-week workout fixtures and add:

```ts
it('uses Polish set-count forms in the peak-day summary', async () => {
  const now = Date.now()
  mocks.getRecentWorkouts.mockResolvedValue([{
    ...pendingWorkout,
    startedAt: now - 60_000,
    finishedAt: now,
    materialized: true,
  }])
  render(<DashboardPage />)

  expect(await screen.findByText('400 kg • 1 seria')).toBeInTheDocument()
  expect(screen.queryByText('400 kg • 1 serii')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the dashboard test and verify failure**

```bash
npx vitest run src/pages/__tests__/DashboardProjectionStatus.test.tsx -t "uses Polish set-count forms"
```

Expected: FAIL because the page renders `1 serii`.

- [ ] **Step 3: Reuse `polishPlural`**

Replace the hard-coded noun:

```ts
copy: peakDay?.volume
  ? `${formatCompactVolume(peakDay.volume)} • ${peakDay.sets} ${polishPlural(peakDay.sets, 'seria', 'serie', 'serii')}`
  : 'Brak treningów w tym tygodniu',
```

- [ ] **Step 4: Run the complete dashboard page test**

```bash
npx vitest run src/pages/__tests__/DashboardProjectionStatus.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the plural correction**

```bash
git add src/pages/DashboardPage.tsx src/pages/__tests__/DashboardProjectionStatus.test.tsx
git commit -m "fix: inflect dashboard set counts"
```

---

### Task 2: Localize heatmap peak dates consistently

**Files:**
- Modify: `src/pages/ProgressPage.tsx:83-85,130-139,344-353,724`
- Test: `src/pages/__tests__/ProgressPage.test.tsx:397-414`

**Interfaces:**
- Produces: `formatHeatmapDate(date: string): string` using the existing `formatDate(timestamp)`.
- Applies to: visible summary, `role="img"` accessible name, and populated-cell title.

- [ ] **Step 1: Strengthen the existing heatmap test**

Set the test clock to `NOW` and assert exact localized content:

```ts
expect(await screen.findByText(
  /3 aktywne dni · najmocniejszy dzień 7 lip · 1\.0k kg/i,
)).toBeInTheDocument()
expect(screen.getByRole('img', {
  name: /Największy dzień: 7 lip, 1\.0k kg\./i,
})).toBeInTheDocument()
expect(screen.queryByText(/najmocniejszy dzień 2026-/i)).not.toBeInTheDocument()
```

- [ ] **Step 2: Run the focused test and verify failure**

```bash
npx vitest run src/pages/__tests__/ProgressPage.test.tsx -t "uses source-aware strength keys"
```

Expected: FAIL because visible and accessible copy contain `YYYY-MM-DD`.

- [ ] **Step 3: Add a native local-date adapter**

Place next to `formatDate`:

```ts
function formatHeatmapDate(date: string): string {
  const timestamp = Date.parse(`${date}T12:00:00`)
  return Number.isFinite(timestamp) ? formatDate(timestamp) : date
}
```

Noon local time avoids a day shift across supported local time zones.

- [ ] **Step 4: Use the formatter for every user-facing heatmap date**

Update the accessible summary:

```ts
return `Kalendarz treningów z ostatnich 12 tygodni. Aktywne dni: ${activeDays.length}. Największy dzień: ${formatHeatmapDate(peak.date)}, ${formatVolume(peak.volume)}.`
```

Update the visible summary:

```ts
return `${activeDays.length} ${polishPlural(activeDays.length, 'aktywny dzień', 'aktywne dni', 'aktywnych dni')} · najmocniejszy dzień ${formatHeatmapDate(peak.date)} · ${formatVolume(peak.volume)}`
```

Update populated-cell titles:

```tsx
title={cell?.date && cell.volume > 0
  ? `${formatHeatmapDate(cell.date)}: ${formatVolume(cell.volume)}`
  : cell?.date
    ? formatHeatmapDate(cell.date)
    : ''}
```

- [ ] **Step 5: Run the complete progress page test**

```bash
npx vitest run src/pages/__tests__/ProgressPage.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit heatmap localization**

```bash
git add src/pages/ProgressPage.tsx src/pages/__tests__/ProgressPage.test.tsx
git commit -m "fix: localize progress heatmap dates"
```

---

### Task 3: Delete the unused `App.tsx`

**Files:**
- Delete: `src/App.tsx`

**Interfaces:**
- Preserves: `src/main.tsx` mounting `AppRouter` directly.

- [ ] **Step 1: Reconfirm the file has no caller**

```bash
rg -n "from ['\"].*App['\"]|<App(?:\s|/|>)" src tests api server --glob '!src/App.tsx'
```

Expected: no import or JSX use of `src/App.tsx`; matches for `AppRouter` and `AppLayout` do not count.

- [ ] **Step 2: Delete the dead file**

Use `apply_patch`:

```diff
*** Delete File: src/App.tsx
```

- [ ] **Step 3: Prove the production entry still builds**

```bash
npm run build
```

Expected: exit 0 and the router chunks are emitted normally.

- [ ] **Step 4: Commit the deletion**

```bash
git add src/App.tsx
git commit -m "chore: remove unused app component"
```

---

### Task 4: Run the polish verification gate

**Files:**
- No product file changes.

**Interfaces:**
- Validates: copy, accessible names, TypeScript, lint, and production bundle.

- [ ] **Step 1: Run focused regressions**

```bash
npx vitest run src/pages/__tests__/DashboardProjectionStatus.test.tsx src/pages/__tests__/ProgressPage.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the repository gate**

```bash
npm run lint
npm run test:unit
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Search for the two obsolete strings**

```bash
rg -n "\b1 serii\b|najmocniejszy dzień 20[0-9]{2}-[0-9]{2}-[0-9]{2}" src tests
```

Expected: no product-code match; test assertions may contain the obsolete strings only as explicit negative checks.

- [ ] **Step 4: Inspect worktree scope**

```bash
git status --short
```

Expected: only intended source/test changes or the pre-existing untracked `output/`; no generated build or test artifacts are staged.
