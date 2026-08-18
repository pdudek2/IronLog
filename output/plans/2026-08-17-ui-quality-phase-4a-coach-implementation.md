# UI Quality Phase 4A — Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to execute this plan task by task. Keep the checkboxes current.

**Status:** DONE

**Goal:** Zamienić Coacha w zwartą powierzchnię roboczą, która jednoznacznie odróżnia tryb tylko do odczytu od trybu aktywnego, utrzymuje composer w zasięgu po konfiguracji i poprawnie pokazuje listy Markdown.

**Architecture:** Zachować istniejący `ChatPage`, `AiKeyPanel`, lokalny storage klucza i lifecycle streamu. Stan bez klucza jest jedną kompaktową bramką w głównym flow; rozwija istniejący `AiKeyPanel` na żądanie, nie tworzy nowego komponentu konfiguracji i nie usuwa bieżącej rozmowy. Layout ogranicza wyłącznie szerokość rozmowy oraz wysokość jej scrollowalnego regionu; renderer Markdown pozostaje bez zmian, a markery przywraca lokalny CSS.

**Tech Stack:** React 19, TypeScript, CSS, Vitest + Testing Library, Playwright.

**Spec:** [kanoniczna roadmapa UI quality](./2026-08-14-ui-quality-roadmap.md), etap 4 / slice Coach. Zatwierdzona decyzja produktowa: bez klucza zachować istniejącą rozmowę read-only, jednoznacznie zablokować composer i sugestie.

## Global constraints

- Scope lineage: `roadmapa UI quality → etap 4 → slice 4A Coach → później Historia/listy oraz shell/404`.
- Nie zmieniać API AI, stream protocol, sposobu przechowywania klucza, kontekstu treningowego, zapisu szablonów ani kontraktów Firestore.
- Nie dodawać zależności, globalnego store, nowego parsera Markdown ani nowego komponentu konfiguracji klucza.
- Bez klucza istniejąca rozmowa pozostaje widoczna i czytelna; composer, retry i sugestie nie mogą uruchomić requestu.
- Pełny `AiKeyPanel` ma być domyślnie zwinięty i otwierany jednym jawnym CTA przy zablokowanej akcji.
- Z kluczem composer ma być widoczny bez przewijania całego dokumentu na 393×852 i 1440×900; długa rozmowa przewija swój region, nie wypycha composera poza viewport.
- Szerokość tekstu odpowiedzi ma pozostać czytelna (`max-width` około 65–70 znaków), bez zwężania generatora planu bardziej niż obecny layout.
- Listy nieuporządkowane i uporządkowane muszą mieć widoczne markery oraz zachować semantyczne `ul`/`ol`/`li`.
- Zachować istniejące minimum 44×44 px, focus ring, statusy błędów, przerwanie/retry streamu i zachowanie trybu Plan.
- Primary visual receipt podczas wykonania: bezpośrednia, serialna obserwacja świeżego runtime w Playwright CLI; screenshoty automatyczne są dowodem pomocniczym, nie zamiennikiem obserwacji.
- Nie pushować bez osobnego polecenia użytkownika.

## File map

- `src/pages/ChatPage.tsx` — kontrakt no-key/read-only, kompaktowa bramka konfiguracji, ukrycie nieaktywnych sugestii i położenie istniejącego `AiKeyPanel`.
- `src/pages/__tests__/ChatPageStreamLifecycle.test.tsx` — regresje utrzymania rozmowy, blokady requestów i rozwijania konfiguracji.
- `src/pages/__tests__/ChatPageAccessibility.test.tsx` — status trybu, accessible CTA i stan Plan bez klucza.
- `src/index.css` — workbench header, ograniczona szerokość rozmowy, widoczny composer i jawne markery list.
- `src/components/ChatMarkdown.tsx` — bez zmian produkcyjnych; istniejące semantyczne listy są właściwym źródłem.
- `src/components/__tests__/ChatMarkdown.test.tsx` — nowy, wąski test semantyki list i escapowania treści.
- `tests/e2e/chat.spec.ts` — desktop/mobile kontrakt no-key, configured composer, długość rozmowy i computed style markerów.
- `output/playwright/ui-quality-phase-4a-coach/` — screenshoty runtime 393 i 1440; katalog jest dowodem, nie kodem produktu.
- `output/plans/2026-08-14-ui-quality-roadmap.md` — status slice’u po integracji.
- `output/plans/2026-08-17-ui-quality-phase-4a-coach-implementation.md` — plan i finalny receipt.

---

### Task 1: Jednoznaczny tryb bez klucza

**Files:**
- Modify: `src/pages/ChatPage.tsx`
- Modify: `src/pages/__tests__/ChatPageStreamLifecycle.test.tsx`
- Modify: `src/pages/__tests__/ChatPageAccessibility.test.tsx`

**Contract:**
- Initial no-key state shows `Tryb tylko do odczytu` and one `Skonfiguruj klucz` action.
- Existing messages remain in `role="log"`; starter prompts are absent and composer stays disabled.
- The full `AiKeyPanel` is absent until the action is used, then its existing `Twój klucz` input appears.
- Removing/rejecting a key returns to the same compact state without clearing messages.

- [x] **Step 1: Replace the old no-key ordering test with the product contract**

In `src/pages/__tests__/ChatPageStreamLifecycle.test.tsx`, replace `puts API key configuration before the blocked chat when no key is saved` with a test that starts a conversation, removes `mocks.apiKey`, triggers the existing retry path, and asserts:

```ts
expect(screen.getByLabelText('Rozmowa z AI Coachem')).toBeVisible()
expect(within(screen.getByRole('log')).getByText('Czy progresuję?')).toBeVisible()
expect(screen.getByLabelText('Status AI Coacha')).toHaveTextContent('Tryb tylko do odczytu')
expect(screen.getByRole('textbox', { name: 'Wiadomość do AI Coacha' })).toBeDisabled()
expect(screen.queryByRole('button', { name: 'Przeanalizuj mój ostatni tydzień treningowy.' }))
  .not.toBeInTheDocument()
expect(screen.queryByLabelText('Twój klucz', { selector: 'input' })).not.toBeInTheDocument()

fireEvent.click(screen.getByRole('button', { name: 'Skonfiguruj klucz' }))
expect(screen.getByLabelText('Twój klucz', { selector: 'input' })).toBeVisible()
```

Keep the existing assertion that no second `streamChatReply` call occurs after the key disappears.

In `src/pages/__tests__/ChatPageAccessibility.test.tsx`, make `mocks.apiKey` mutable as in the lifecycle suite and add a no-key test asserting the status line reads `Tryb tylko do odczytu`, the configuration trigger has an accessible name, and `Plan` can be inspected while `Generuj plan` remains disabled.

- [x] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run \
  src/pages/__tests__/ChatPageStreamLifecycle.test.tsx \
  src/pages/__tests__/ChatPageAccessibility.test.tsx
```

Expected: FAIL because the full `AiKeyPanel` is currently mounted immediately and starter prompts remain as disabled controls.

- [x] **Step 3: Implement the state with existing pieces only**

In `src/pages/ChatPage.tsx`:

1. Initialize `showConfigPanel` to `false` and remove the effect that forces it to `true` when `configured` becomes false.
2. Replace the unconditional no-key `AiKeyPanel` before the chat with a compact `section.coach-key-gate` containing:
   - eyebrow/status `Tryb tylko do odczytu`;
   - one sentence explaining that conversation history remains readable but AI actions require a local Claude key;
   - `Button` named `Skonfiguruj klucz`, toggling `showConfigPanel`.
3. Render the existing `AiKeyPanel` immediately after that gate only when `!configured && showConfigPanel`; pass the existing callbacks and close the expansion after successful configuration.
4. Change the header status copy from `Klucz wymagany` to `Tryb tylko do odczytu` when unconfigured.
5. Render `.coach-empty-prompts` only when `configured`; do not replace disabled suggestions with another inactive control.
6. Leave the textarea present and disabled with its current accessible name. Do not clear `messages` when configuration changes.
7. Keep the configured side-rail `AiKeyPanel` and all generation lifecycle code unchanged.

Use local JSX and existing `Button`; do not extract `CoachKeyGate` for this single use.

- [x] **Step 4: Re-run focused tests and confirm GREEN**

Run the command from Step 2.

Expected: both files PASS and no React act/console warnings.

- [x] **Step 5: Commit the state contract**

```bash
git add src/pages/ChatPage.tsx \
  src/pages/__tests__/ChatPageStreamLifecycle.test.tsx \
  src/pages/__tests__/ChatPageAccessibility.test.tsx
git commit -m "fix: clarify coach read only state"
```

---

### Task 2: Workbench geometry and visible composer

**Files:**
- Modify: `src/index.css`
- Modify: `tests/e2e/chat.spec.ts`

**Contract:**
- The Coach header is compact enough that the active workspace, not the hero, owns the first viewport.
- On configured chat at 393×852 and 1440×900, the composer is fully visible at document `scrollY === 0`.
- Long responses stay within a centered reading measure; the thread can scroll independently without moving the composer.
- No-key configuration expands in the same main column without recreating stacked decorative cards.

- [x] **Step 1: Add geometry assertions to the existing E2E file**

In `tests/e2e/chat.spec.ts`:

1. Update `AiKeyPanel is visible and shows correct empty state` to assert the compact gate first, click `Skonfiguruj klucz`, then assert the existing input/local-storage note.
2. Replace `no-key chat uses the available width without stacking cards` with assertions that:
   - `.coach-key-gate` and `.coach-chat-panel` share the same main column;
   - the full `.ai-key-panel` is absent before expansion;
   - no horizontal overflow exists at desktop and mobile.
3. Add a configured geometry test using `installMockAiRuntime` and assert:

```ts
const composer = page.locator('.coach-composer')
await expect(composer).toBeInViewport()
expect(await page.evaluate(() => window.scrollY)).toBe(0)

const measure = await page.locator('.coach-message[data-role="assistant"] .chat-markdown')
  .first()
  .evaluate((element) => element.getBoundingClientRect().width)
expect(measure).toBeLessThanOrEqual(760)
```

Seed/use the existing demo Markdown or send a response through `installMockAiRuntime`; do not call Anthropic.

- [x] **Step 2: Run the new E2E contract and confirm RED**

Run:

```bash
npx playwright test tests/e2e/chat.spec.ts \
  --project=desktop --project=mobile --retries=0 \
  --grep "empty state|available width|configured geometry"
```

Expected: FAIL on the old immediate key panel and at least one composer/measure assertion.

- [x] **Step 3: Make the smallest local CSS change**

In the final `/* AI Coach */` layer of `src/index.css`:

- compact `.coach-header` and its title; keep the Puls display face but reduce the vertical lead-in;
- add `.coach-key-gate` as one bordered ledger row with wrapping copy and one 44 px action, not a new card treatment;
- constrain `.coach-chat-panel` and its message content to a centered `max-width` of about `46rem`; do not apply that constraint to `.coach-plan-panel`;
- turn `.coach-chat-panel` into a bounded grid where the header and composer are fixed rows and `.coach-thread` is `minmax(0, 1fr)`;
- remove the fixed `19rem`/`34rem` thread heights that can push the composer below the viewport; use a panel height derived from `100dvh` with existing mobile-nav clearance, plus a safe `min-height`;
- keep `.coach-thread-scroll { overflow-y: auto; }` and add `overscroll-behavior: contain`;
- keep borders flat and reuse `--surface-*`, `--border-*`, `--accent`, `--muted` and the existing focus styles.

Do not edit global `.page-title`, navigation geometry or unrelated workbench pages in this slice.

- [x] **Step 4: Re-run E2E geometry and focused unit tests**

Run:

```bash
npx playwright test tests/e2e/chat.spec.ts \
  --project=desktop --project=mobile --retries=0 \
  --grep "empty state|available width|configured geometry"

NODE_OPTIONS=--no-experimental-webstorage npx vitest run \
  src/pages/__tests__/ChatPageStreamLifecycle.test.tsx \
  src/pages/__tests__/ChatPageAccessibility.test.tsx
```

Expected: PASS at both Playwright breakpoints and in both unit files.

- [x] **Step 5: Commit the geometry**

```bash
git add src/index.css tests/e2e/chat.spec.ts
git commit -m "fix: tighten coach workbench layout"
```

---

### Task 3: Widoczne i bezpieczne listy Markdown

**Files:**
- Create: `src/components/__tests__/ChatMarkdown.test.tsx`
- Modify: `src/index.css`
- Modify: `tests/e2e/chat.spec.ts`

**Contract:** semantic list markup already produced by `ChatMarkdown` remains unchanged; CSS restores visible bullets/numbers after the global reset.

- [x] **Step 1: Add a focused semantic and escaping test**

Create `src/components/__tests__/ChatMarkdown.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ChatMarkdown from '../ChatMarkdown'

describe('ChatMarkdown', () => {
  it('renders ordered and unordered lists while escaping raw HTML', () => {
    render(<ChatMarkdown content={'- Bench\n- Squat\n\n1. Warm-up\n2. Work set\n\n<script>alert(1)</script>'} />)

    const lists = screen.getAllByRole('list')
    expect(lists).toHaveLength(2)
    expect(within(lists[0]).getAllByRole('listitem')).toHaveLength(2)
    expect(within(lists[1]).getAllByRole('listitem')).toHaveLength(2)
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText('<script>alert(1)</script>')).toBeVisible()
  })
})
```

- [x] **Step 2: Confirm the semantic test is already GREEN**

Run:

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/components/__tests__/ChatMarkdown.test.tsx
```

Expected: PASS. This proves the renderer is not the root cause and should remain unchanged.

- [x] **Step 3: Add a browser-level computed-style assertion and confirm RED**

In the configured E2E flow in `tests/e2e/chat.spec.ts`, use the existing demo list or a mocked reply containing both list kinds and assert:

```ts
await expect(page.locator('.chat-markdown li').first()).toBeVisible()
await expect(page.locator('.chat-markdown ul').first()).toHaveCSS('list-style-type', 'disc')
await expect(page.locator('.chat-markdown ol').first()).toHaveCSS('list-style-type', 'decimal')
```

Do not use screenshot pixels as the only list-marker assertion.

Run:

```bash
npx playwright test tests/e2e/chat.spec.ts --project=desktop --project=mobile --retries=0 --grep "Markdown lists"
```

Expected: FAIL because the current global reset leaves both list kinds without visible markers.

- [x] **Step 4: Restore list markers locally**

In `src/index.css`, extend the existing `.chat-markdown ul, .chat-markdown ol` block:

```css
.chat-markdown ul,
.chat-markdown ol {
  margin: 0;
  padding-left: 1.35rem;
  list-style-position: outside;
}

.chat-markdown ul {
  list-style-type: disc;
}

.chat-markdown ol {
  list-style-type: decimal;
}
```

Do not change `ChatMarkdown.tsx` unless the semantic test exposes a real parser defect.

- [x] **Step 5: Run focused checks and commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/components/__tests__/ChatMarkdown.test.tsx
npx playwright test tests/e2e/chat.spec.ts --project=desktop --project=mobile --retries=0 --grep "Markdown lists"
git add src/components/__tests__/ChatMarkdown.test.tsx src/index.css tests/e2e/chat.spec.ts
git commit -m "fix: restore coach markdown list markers"
```

---

### Task 4: Fresh runtime gate, integration receipt and closeout

**Files:**
- Modify: `tests/e2e/chat.spec.ts` only if the runtime exposes a real contract gap
- Modify: `output/plans/2026-08-17-ui-quality-phase-4a-coach-implementation.md`
- Modify: `output/plans/2026-08-14-ui-quality-roadmap.md`
- Create: `output/playwright/ui-quality-phase-4a-coach/coach-no-key-mobile.png`
- Create: `output/playwright/ui-quality-phase-4a-coach/coach-configured-mobile.png`
- Create: `output/playwright/ui-quality-phase-4a-coach/coach-configured-desktop.png`

- [x] **Step 1: Run target checks**

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run \
  src/components/__tests__/ChatMarkdown.test.tsx \
  src/pages/__tests__/ChatPageAccessibility.test.tsx \
  src/pages/__tests__/ChatPageStreamLifecycle.test.tsx

npx playwright test tests/e2e/chat.spec.ts \
  --project=desktop --project=mobile --retries=0
```

Expected: all assertions PASS. A runner-only teardown diagnostic may be qualified only after every product assertion completed and the same teardown signature is reproduced; do not suppress app errors.

- [x] **Step 2: Observe the actual product serially in a fresh runtime**

Use one named Playwright CLI session and inspect `/chat` in this order:

1. 393×852, no key, empty conversation: compact read-only gate, no inactive starter prompts, composer disabled, no horizontal overflow.
2. 393×852, no key with an existing conversation: messages readable, config closed by default, composer visible and disabled.
3. 393×852, mocked configured runtime: composer fully visible at `scrollY === 0`, 44 px controls, long thread scrolls without moving composer, list markers visible.
4. 1440×900, mocked configured runtime: workbench header is subordinate to task, conversation measure is constrained, rail and composer are visible, no excessive empty width.
5. Switch to Plan in both key states: no-key gate explains the disabled generation action; configured generation remains operable.
6. Exercise keyboard focus through mode switch, configuration trigger/input, thread, composer and send action; inspect console after every state.

Save screenshots to `output/playwright/ui-quality-phase-4a-coach/`, then inspect each saved file separately with the image viewer before marking the visual receipt `Observed`.

- [x] **Step 3: Run full repository gates**

```bash
npm run lint
NODE_OPTIONS=--no-experimental-webstorage npm run test:unit
npm run build
git diff --check
```

Expected: all PASS. Preserve unrelated untracked `output/` artifacts.

- [x] **Step 4: Self-review the scoped diff**

Review `git diff "$(git merge-base main HEAD)"...HEAD` for:

- no AI protocol/storage/Firestore change;
- no cleared messages on key transitions;
- no actionable prompt/retry/generate request without a key;
- no global title/list reset change;
- no new dependency or abstraction;
- focus, 44 px targets, 393/1440 geometry and list-marker evidence present.

Fix any Critical/Important finding, rerun its focused gate, then rerun the full gates.

- [x] **Step 5: Close the slice and preserve parent lineage**

Update this plan with:

- `Status: READY_FOR_INTEGRATION`;
- branch commit range; leave the integration commit explicitly pending;
- target/full gate counts;
- visual receipt `Observed` with screenshot paths;
- any qualified diagnostic and exact reason;
- remaining parent scope: `Historia/listy`, `shell/404`, etap 5, B-02, M-07, M-14.

Update the parent roadmap execution line to mark slice 4A Coach verified on its branch and pending integration. Name `Etap 4B — Historia/listy` as next after integration, but do not mark 4A or all of etap 4 integrated yet. Post-merge closeout owns `DONE` and the integration commit.

```bash
git add output/plans/2026-08-17-ui-quality-phase-4a-coach-implementation.md \
  output/plans/2026-08-14-ui-quality-roadmap.md
git commit -m "docs: prepare coach workbench integration"
```

No push without explicit authority.

## Integration receipt

- **Integration:** branch `ui-quality-phase-4a-coach` was integrated locally into `main` by fast-forward through `f83a8c4`; verified product range `c16a764..a554807`.
- **Target gates:** 3 Vitest files / 25 tests PASS; full `chat.spec.ts` on emulator-backed desktop and mobile / 31 tests PASS.
- **Repository gates:** ESLint PASS; 74 Vitest files / 597 tests PASS; production build PASS; `git diff --check` PASS. The same lint, unit, build and 31-test emulator-backed E2E gates passed again from `main` after integration.
- **Runtime:** `Observed` serially in one named Playwright CLI session at 393×852 and 1440×900. No-key chat has one compact read-only gate, explicit empty-history copy, no starter actions and a disabled composer; an existing conversation survives key removal. Rejected key details remain open for correction, and successful recovery removes the stale blocking alert. Configured chat keeps the composer above the mobile navigation at `scrollY === 0`, constrains the desktop response to 699 px, scrolls the thread independently, exposes semantic `disc` and `decimal` list markers, and keeps Plan generation operable. Keyboard traversal reached the mode switch, configuration trigger/input, composer and enabled send action. Console: 0 errors, 0 warnings.
- **Visual evidence:** `output/playwright/ui-quality-phase-4a-coach/coach-no-key-mobile.png`, `output/playwright/ui-quality-phase-4a-coach/coach-configured-mobile.png`, `output/playwright/ui-quality-phase-4a-coach/coach-configured-desktop.png`; each file was inspected separately.
- **Runtime gap closed:** the fresh 393×852 observation found the fixed bottom navigation covering 27 px of `Wyślij`; commit `7b594bd` adds the browser regression and keeps the action fully above the navigation.
- **Review gaps closed:** commit `461cd67` preserves rejected-key recovery, clears stale no-key alerts after successful configuration, aligns the read-only empty copy, exposes disclosure state and scopes the Markdown browser assertions to the mocked reply. Commit `a554807` also clears the equivalent stale missing-key alert in Plan mode while preserving unrelated plan errors.
- **Diagnostics:** no product diagnostic was qualified. The full E2E run completed cleanly; runner output only contained existing Node/FORCE_COLOR warnings.
- **Remaining parent scope:** `Etap 4B — Historia/listy`, `Etap 4C — shell/404`, etap 5, B-02, M-07 and M-14.

## Definition of done

- No-key Coach has one clear read-only state and one path to configuration.
- Existing conversation survives loss/rejection of the key and remains readable.
- Suggestions, composer, retry and plan generation cannot issue a request without a key.
- Configured composer is visible at document top on 393×852 and 1440×900.
- Long conversation text is constrained and scroll behavior keeps the composer reachable.
- Markdown bullets and numbers are visible and semantic.
- Chat lifecycle, accessibility, E2E, lint, full unit and build gates pass.
- Fresh runtime screenshots are directly observed and the parent roadmap points to the next open slice.

## Explicit non-goals

- Persisting conversation history between reloads.
- Replacing the custom Markdown renderer or adding a Markdown dependency.
- Moving the API key to server storage.
- Redesigning the Plan generator, AI protocol or context assembly.
- Refactoring global page-shell utilities or other etap 4 workbench screens.
- Implementing History/list, 404 or etap 5 consistency work in this slice.

## Plan self-review

- **Parent coverage:** covers only Coach items from etap 4; History/list and shell/404 remain named and owned by the parent.
- **Decision safety:** the settled no-key decision is explicit; no new product choice is hidden in implementation detail.
- **Root cause:** reuses semantic Markdown output and fixes reset-induced marker loss in local CSS; reuses `AiKeyPanel` instead of duplicating configuration.
- **Testability:** state, request blocking, geometry and computed list styles each have an executable check.
- **Scope control:** no API, persistence, data-model, design-system or dependency work.
- **Placeholders:** none; every task has exact files, contract, command and expected result.
