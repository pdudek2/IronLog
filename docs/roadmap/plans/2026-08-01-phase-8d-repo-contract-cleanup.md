# Repository Contract and Scaffolding Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uzgodnić lokalne instrukcje agenta z aktualnym produktem Puls i usunąć dwa potwierdzone, nieużywane assety startowe Vite bez zmiany działania aplikacji.

**Status:** COMPLETED

**Architecture:** Lokalny `AGENTS.md` pozostaje kontraktem dla agentów w worktree i jest korygowany na podstawie bieżącego CSS, fontów, reguł Firestore oraz serwerowego lifecycle workoutu. Plik jest celowo ignorowany i nie trafia do historii Git. Cleanup ogranicza się do dwóch śledzonych plików SVG, dla których repo-wide `rg` nie znajduje żadnego konsumenta. Nie powstaje nowa warstwa dokumentacji ani mechanizm kompatybilności.

**Tech Stack:** Markdown, React 19, TypeScript 5.9, Vite 8, Firebase Auth/Firestore, Vercel Node Functions.

## Global Constraints

- Zakres obejmuje wyłącznie `DOC-01` i `CLEANUP-01` z aktywnej roadmapy.
- Lokalny `AGENTS.md` ma opisywać aktualny produkt Puls, nie historyczny motyw ani projekt studencki; jest celowo ignorowany i nigdy nie może być stage'owany ani commitowany.
- Dane wizualne muszą odpowiadać tokenom w `src/index.css` i fontom ładowanym w `index.html`.
- Ukończone workouty powstają wyłącznie przez serwerowy endpoint finalizacji; klient nie ma prawa zapisu do `workouts`.
- Usunąć tylko assety z zerową liczbą referencji w repo: `src/assets/react.svg` i `src/assets/vite.svg`.
- Nie zmieniać kodu aplikacji, CSS, promptów, danych, reguł Firestore, indeksów ani zależności.
- Nie refaktoryzować działających plików dla estetyki.
- Diagnostyka Vercela dotycząca `Object.hasOwn` nie należy do 8D; jeśli nadal się odtwarza, otrzymuje osobny mały fix przed Fazą 9.
- Nie stage'ować `AGENTS.md`, `.impeccable/`, `output/` ani `docs/audits/2026-07-14-senior-design-review.md`.
- Push i deploy wymagają osobnej zgody.

---

## File Structure

### Modified files

- `docs/roadmap/ROADMAP.md` — status 8D i odblokowanie Fazy 9 po closeoucie.
- `docs/roadmap/plans/2026-08-01-phase-8d-repo-contract-cleanup.md` — checklisty i dowody.

### Local-only files

- `AGENTS.md` — aktualny opis produktu, design systemu i serwerowej finalizacji workoutu; celowo ignorowany, nigdy nie jest stage'owany ani commitowany.

### Deleted files

- `src/assets/react.svg` — nieużywany asset startowy Vite.
- `src/assets/vite.svg` — nieużywany asset startowy Vite.

### Deliberately unchanged

- `src/assets/hero.png` — istniejący asset produktu; nie jest częścią potwierdzonego scaffoldingu.
- `src/index.css` i `index.html` — źródła prawdy dla opisywanego design systemu, bez zmian wizualnych.
- `src/lib/workoutClosureService.ts`, `api/_lib/workoutClosure.ts` i `firestore.rules` — źródła prawdy dla serwerowej finalizacji, bez zmian zachowania.

---

## Task 1: Uzgodnić lokalny kontrakt z aktualnym produktem

**Files:**

- Local-only (celowo ignorowany; nigdy nie stage'ować ani commitować): `AGENTS.md`

- [x] **Step 1: Zapisać dowód rozjazdu lokalnego kontraktu**

Run:

```bash
rg -n "projekt zaliczeniowy|electric blue|Syne|Urbanist|klient tworzy" AGENTS.md
rg -n -- "Primitive: Puls palette|--font-display|--font-body|--primary-gradient" src/index.css
rg -n "Archivo|Instrument.Sans|Spline.Sans.Mono" index.html
rg -n "finalize-workout|allow create, update, delete: if false" src/lib/workoutClosureService.ts firestore.rules
```

Expected:

- pierwsza komenda pokazuje historyczne informacje w `AGENTS.md`;
- pozostałe komendy pokazują aktualny Puls, fonty, endpoint finalizacji i brak zapisu klienta do `workouts`.

- [x] **Step 2: Zastąpić opis projektu**

W `AGENTS.md` zastąpić sekcję `## Projekt`:

```md
## Projekt

IronLog to webowa aplikacja treningowa do prowadzenia aktywnych sesji, planów,
historii, postępów i pracy z AI Coachem. Aktualny kierunek produktu i interfejsu
to **Puls**. Priorytet: wiarygodny lifecycle treningu, spójne dane i ukończenie
przepływów end-to-end bez over-engineeringu.
```

- [x] **Step 3: Zastąpić historyczny opis design systemu**

W `AGENTS.md` zastąpić całą sekcję `## Design system` poniższą treścią:

```md
## Design system

**Puls**: ciemny, instrumentowy interfejs z ograniczoną liczbą pudełek,
jednoczęściowymi powierzchniami i czytelną hierarchią operacyjną. Tokeny CSS
znajdują się w `src/index.css`:

- tło: `--puls-black: #111012` i `--puls-black-deep: #0b0a0c`;
- powierzchnie: `--puls-surface-1/2/3`;
- wysiłek/akcent: `--puls-effort: #f0435a`;
- regeneracja/success: `--puls-recovery: #8fb8a0`;
- warning: `--puls-warning: #f0a75a`;
- display font: `'Archivo'`, body font: `'Instrument Sans'`, mono:
  `'Spline Sans Mono'`; wszystkie są ładowane w `index.html`;
- tło body używa warstwowych gradientów Puls i subtelnej siatki; nie opisuj
  usuniętych blurred blobs ani starego electric-blue theme;
- primary buttons używają `--primary-gradient` od `#c72e44` do `#a91f35`;
- utility classes obejmują m.in. `.page-shell`, `.page-container`,
  `.surface-panel`, `.glass`, `.metric-card`, `.eyebrow`, `.section-title`,
  `.page-title`, `.stat-value`, `.stat-meta` i `.accent-outline`;
- mobile-first; desktop rail (`app-shell-grid` + `.desktop-rail`) jest widoczny
  od `lg:`.
```

- [x] **Step 4: Poprawić kontrakt danych workoutu**

W sekcji `## Architektura danych` zastąpić bullet `workouts` i dodać brakujący
fence lifecycle:

```md
- `workouts/{id}` — ukończone treningi; klient ma owner read, a create/update/delete wykonuje wyłącznie Admin SDK;
- `closedSessions/{workoutId}` — serwerowy tombstone i version fence lifecycle; klient nie ma dostępu;
```

W `## Konwencje kodu` dodać:

```md
- Zakończenie i odrzucenie sesji przechodzi przez `/api/finalize-workout` i `/api/discard-session` za pośrednictwem `src/lib/workoutClosureService.ts`; klient nie tworzy dokumentu `workouts` bezpośrednio
```

- [x] **Step 5: Potwierdzić usunięcie starych twierdzeń**

Run:

```bash
if rg -n "projekt zaliczeniowy|electric blue|Syne|Urbanist|klient tworzy" AGENTS.md; then
  exit 1
fi
rg -n "Puls|Archivo|Instrument Sans|closedSessions|finalize-workout" AGENTS.md
```

Expected: pierwsze `rg` nie znajduje dopasowań; drugie potwierdza nowy kontrakt.

- [x] **Step 6: Potwierdzić lokalny status**

```bash
git check-ignore -v AGENTS.md
git ls-files AGENTS.md
```

Expected: pierwsza komenda potwierdza regułę ignorowania, a druga nie zwraca żadnego pliku.

---

## Task 2: Usunąć potwierdzony scaffolding Vite

**Files:**

- Delete: `src/assets/react.svg`
- Delete: `src/assets/vite.svg`

- [x] **Step 1: Potwierdzić ownership i brak referencji**

Run:

```bash
git ls-files --error-unmatch src/assets/react.svg src/assets/vite.svg
if rg -n "react\.svg|vite\.svg" --glob '!node_modules/**' --glob '!.git/**' --glob '!.worktrees/**' --glob '!docs/**' --glob '!.superpowers/**' .; then
  exit 1
fi
```

Expected: oba assety są śledzone, a repo nie zawiera żadnego ich konsumenta.

- [x] **Step 2: Usunąć wyłącznie dwa martwe assety**

Usunąć:

```text
src/assets/react.svg
src/assets/vite.svg
```

Nie usuwać `src/assets/hero.png` ani żadnego pliku z `public/`.

- [x] **Step 3: Potwierdzić zakres diffu**

Run:

```bash
git diff --name-status -- src/assets
```

Expected:

```text
D	src/assets/react.svg
D	src/assets/vite.svg
```

- [x] **Step 4: Commit**

```bash
git add src/assets/react.svg src/assets/vite.svg
git commit -m "chore: remove unused Vite assets"
```

---

## Task 3: Gate i closeout Fazy 8D

**Files:**

- Modify: `docs/roadmap/ROADMAP.md`
- Modify: `docs/roadmap/plans/2026-08-01-phase-8d-repo-contract-cleanup.md`

- [x] **Step 1: Uruchomić kontrakty lokalne**

```bash
if rg -n "projekt zaliczeniowy|electric blue|Syne|Urbanist|klient tworzy" AGENTS.md; then
  exit 1
fi
git check-ignore -v AGENTS.md
test -z "$(git ls-files AGENTS.md)"
if rg -n "react\.svg|vite\.svg" --glob '!node_modules/**' --glob '!.git/**' --glob '!.worktrees/**' --glob '!docs/**' --glob '!.superpowers/**' .; then
  exit 1
fi
rg -n "Puls|Archivo|Instrument Sans|closedSessions|finalize-workout" AGENTS.md
```

Expected: lokalny `AGENTS.md` jest ignorowany i nieśledzony; brak starych twierdzeń i referencji do assetów; nowy kontrakt jest obecny.

- [x] **Step 2: Uruchomić gate'y techniczne**

```bash
npm run lint
npm run build
git diff --check
```

Expected: wszystkie komendy kończą się kodem `0`; build przetwarza produkcyjny frontend i typecheck bez błędów.

Nie uruchamiać pełnego `test:unit`: faza nie zmienia kodu wykonywalnego ani testów, a lint + TypeScript/build są właściwą powierzchnią regresji.

- [x] **Step 3: Wykonać focused review**

Potwierdzić:

- każdy zmieniony fakt w lokalnym `AGENTS.md` ma bezpośredni odpowiednik w CSS, HTML, regułach albo lifecycle service;
- żaden historyczny motyw ani zapis klienta do `workouts` nie pozostał;
- usunięte zostały dokładnie dwa pliki z zerową liczbą referencji;
- nie zmieniono runtime, UI, reguł, indeksów, zależności ani innych assetów;
- lokalne nieśledzone pliki użytkownika pozostały nietknięte.

- [x] **Step 4: Zapisać dowody i zamknąć roadmapę**

W tym planie ustawić status `COMPLETED`, oznaczyć wykonane checkboxy i dopisać
commity oraz dokładne wyniki gate'ów i focused review.

W `docs/roadmap/ROADMAP.md`:

- ustawić Fazę 8D na `DONE` i podlinkować ten plan;
- ustawić Fazę 9 na `READY`;
- zmienić status dokumentu na `Faza 8D DONE; Faza 9 READY`;
- zachować 8A–8C jako `DONE`.

- [x] **Step 5: Commit closeoutu**

```bash
git add docs/roadmap/ROADMAP.md docs/roadmap/plans/2026-08-01-phase-8d-repo-contract-cleanup.md
git commit -m "docs: close repository contract cleanup"
```

Nie wykonywać pushu ani deployu bez osobnej zgody.

---

## Dowody wykonania

### Commity

- `b379f21773c376c8781fc48087421694e94f7a07` — korekta skanu referencji, aby dokumentacja i artefakty SDD nie były traktowane jako konsumenci runtime;
- `ec1730c9fd684790fca7225c72f14dff8fc0b039` — utrzymanie `AGENTS.md` jako lokalnego, ignorowanego kontraktu; plik nie trafił do historii Git;
- `a81f9cf4619918eab18b6c2a70adfd695617885a` — usunięcie wyłącznie `src/assets/react.svg` i `src/assets/vite.svg`.

### Gate'y lokalnego kontraktu — 2026-08-02

- skan `projekt zaliczeniowy|electric blue|Syne|Urbanist|klient tworzy` — exit `0`, bez dopasowań;
- `git check-ignore -v AGENTS.md` — exit `0`, reguła `.gitignore:44:AGENTS.md`;
- `test -z "$(git ls-files AGENTS.md)"` — exit `0`, plik nieśledzony;
- skan `react\.svg|vite\.svg` z wykluczeniami planu — exit `0`, bez dopasowań;
- skan aktualnego kontraktu — exit `0`, potwierdził `Puls`, `Archivo`, `Instrument Sans`, `closedSessions` i `finalize-workout`.

### Gate'y techniczne — 2026-08-02

- `npm run lint` — exit `0`, bez błędów;
- `npm run build` — exit `0`; TypeScript przeszedł, Vite 8.1.2 przetworzył 878 modułów i zbudował frontend produkcyjny;
- `git diff --check` — exit `0`, bez błędów whitespace;
- pełny `npm run test:unit` celowo pominięto zgodnie z planem; baseline przed implementacją: 63 pliki i 484 testy zaliczone.

### Focused review

- fakty zmienione w lokalnym `AGENTS.md` potwierdzają tokeny i powierzchnie Puls w `src/index.css`, fonty w `index.html`, blokada zapisu klienta w `firestore.rules` oraz endpointy i serwerowe transakcje w `src/lib/workoutClosureService.ts` i `api/_lib/workoutClosure.ts`;
- skan nie znalazł historycznego motywu, a `src/lib/workoutService.ts` finalizuje trening przez endpoint i używa referencji do `workouts` po stronie klienta wyłącznie do odczytu;
- commit `a81f9cf4619918eab18b6c2a70adfd695617885a` usuwa dokładnie dwa SVG bez konsumentów; `src/assets/hero.png` i `public/` pozostały;
- nie zmieniono runtime, UI, CSS, reguł, indeksów, zależności ani innych assetów;
- `AGENTS.md` i pozostałe lokalne pliki użytkownika pozostały poza stagingiem; build odświeżył wyłącznie ignorowany `dist/`.
