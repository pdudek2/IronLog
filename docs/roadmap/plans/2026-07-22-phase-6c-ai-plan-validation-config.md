# Phase 6C AI Plan Validation and Config Handling Plan

**Status:** COMPLETED — VERIFIED LOCALLY

**Goal:** Sklasyfikować błędy konfiguracji AI, utrzymać BYOK bez zapisu klucza, zwalidować wygenerowany plan względem briefu i ustawić mobile bez klucza na konfigurację przed zablokowanym czatem.

**Approved design:** `docs/roadmap/specs/2026-07-22-phase-6c-ai-plan-validation-config-design.md`

**Scope lineage:** `docs/roadmap/ROADMAP.md` → Faza 6C (`AI-04`, `AI-05`, `AI-06`, `AI-12`, `AI-13`, `AI-14`).

## Completed Changes

- [x] Dodać wspólną klasyfikację statusów Anthropic dla chat, planu i listy modeli.
- [x] Zwracać publiczne `code` w błędach API bez przepuszczania surowych detali upstreamu.
- [x] Rozróżnić `invalid-key` od retryable/network/upstream/model-list failure w panelu konfiguracji.
- [x] Nie blokować czatu samą awarią listy modeli.
- [x] Walidować plan na API: liczba dni, katalog ćwiczeń, sprzęt, limity szablonu.
- [x] Pokazać konfigurację przed zablokowanym czatem, kiedy nie ma klucza.
- [x] Zaktualizować README o rzeczywisty minutowy limit Firestore.
- [x] Zachować BYOK bez zapisu klucza w Firestore i bez logowania klucza/promptu/odpowiedzi.

## Verification

- [x] `npm run test:unit -- api/__tests__/aiChatStreamIntegration.test.ts api/__tests__/aiChatContextIntegration.test.ts src/pages/__tests__/ChatPageStreamLifecycle.test.tsx src/pages/__tests__/ChatPageAccessibility.test.tsx src/lib/__tests__/chatService.test.ts` — 51/51 pass.
- [x] `npm run test:unit` — 59 plików, 467/467 pass.
- [x] `npm run lint` — pass.
- [x] `npm run build` — pass.

## Not Included

- [ ] Push.
- [ ] Deploy.
- [ ] Production index publication.
- [ ] `RELEASE-08`.
- [ ] Phase 2B or Phase S.
