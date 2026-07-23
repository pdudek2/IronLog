# Faza 2B — Integralność własnych ćwiczeń

**Status:** APPROVED — READY FOR IMPLEMENTATION

**Data:** 2026-07-23

**Właściciel zakresu:** `DATA-01`, `DATA-02`, `DATA-03` z `docs/roadmap/ROADMAP.md`

**Route:** Medium — transakcyjny kontrakt obejmuje create, rename, delete, reguły Firestore i test emulatorowy

**Ryzyko:** Elevated — błąd może utworzyć duplikat albo zerwać historyczne referencje do ćwiczenia użytkownika

## 1. Problem

`createUserExercise` wykonuje query po `userId + name`, a następnie niezależne `addDoc`. Dwa klienty mogą przejść query przed pierwszym zapisem i utworzyć dwa logicznie identyczne ćwiczenia. `updateUserExercise` ma ten sam wyścig przy równoległej zmianie nazwy.

## 2. Docelowy kontrakt

- Tożsamość nazwy pozostaje zgodna z obecnym zachowaniem: porównujemy dokładną nazwę po `trim()`. Faza nie wprowadza case folding ani nowej normalizacji produktowej.
- Każda nowa lub przejęta nazwa ma dokument `userExerciseNames/{uid}_{sha256(name)}` z polami `userId`, `exerciseId`, `name`.
- Utworzenie ćwiczenia zapisuje claim i losowy dokument `userExercises/{id}` w jednej transakcji.
- Rename atomowo przejmuje nowy claim, zwalnia poprzedni i aktualizuje istniejący dokument bez zmiany jego ID.
- Delete atomowo usuwa ćwiczenie oraz należący do niego claim.
- Istniejące dokumenty bez `nameClaimId` pozostają czytelne. Pierwsza edycja przez nowy klient przejmuje claim bez zmiany ID.
- Przed transakcją pozostaje query `userId + name`, żeby istniejący legacy dokument bez claimu nadal blokował duplikat.

## 3. Reguły i rollout

- Nowe create wymaga `nameClaimId` oraz pasującego claimu widocznego przez `getAfter`.
- Nowe update wymaga pasującego claimu. Legacy dokument bez claimu może być aktualizowany bez claimu tylko wtedy, gdy nazwa się nie zmienia.
- Delete claimed dokumentu wymaga usunięcia claimu w tej samej operacji.
- Claim może być odczytany tylko przez właściciela przestrzeni `uid_*`; zapis musi wskazywać owned `userExercises/{exerciseId}`.
- Produkcyjny rollout wymaga SPA i reguł w jednym kontrolowanym wydaniu. Nie jest częścią lokalnej Fazy 2B ani obecnej zgody.

## 4. Kompatybilność

Nie migrujemy dokumentów `userExercises`, `templates`, `activeSessions`, `workouts`, `exerciseSessions` ani `records`. `exerciseSource: 'user'` i `exerciseId` pozostają bez zmian. Seed demo może nadal tworzyć legacy dokumenty; reset musi usuwać również claimy utworzone później przez aplikację.

## 5. Weryfikacja

- Emulator Firestore: dwa równoległe create tej samej nazwy dają jeden sukces, jeden błąd duplikatu i jeden dokument.
- Emulator Firestore: dwa równoległe rename do tej samej nazwy dają najwyżej jeden dokument o nazwie docelowej.
- Emulator Firestore: legacy dokument po edycji zachowuje ID i otrzymuje claim.
- Emulator Firestore: delete zwalnia claim i pozwala ponownie utworzyć tę samą nazwę.
- Bezpośredni create bez claimu jest odrzucany przez reguły.
- Existing UI pokazuje komunikat serwisu w formularzu; targeted unit, rules, lint, pełny unit i build pozostają zielone.

## 6. Recovery

Kod można cofnąć bez migracji istniejących ćwiczeń. Pozostałe claimy są ignorowane przez stary klient; przed ponownym wdrożeniem nowego kontraktu można je bezpiecznie odbudować albo usunąć po `userId`. Push, deploy i produkcyjna publikacja reguł wymagają osobnej zgody.
