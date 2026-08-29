# IronLog 5C — coverage ledger

**Tryb:** Product, read-only względem produktu  
**Runtime:** świeży lokalny Vite + Firebase Auth/Firestore emulator + lokalne API  
**Konto:** dwa jednorazowe konta audytowe; dane wypełnione wyłącznie w emulatorze  
**Dowody:** 53 screenshoty z bieżącego runtime; ostrzeżenia/błędy Browser console: `0`

`Observed` oznacza bezpośrednią obserwację w Codex in-app Browser. `Test-supported` oznacza istniejącą automatyczną bramkę, a nie zastępstwo za obserwację pikseli.

| Powierzchnia | Główne zadanie | Stan | Viewport | Pochodzenie | Status | Reprezentatywny dowód |
| --- | --- | --- | --- | --- | --- | --- |
| `/login` | zalogowanie | loaded | 393, 1440 | fresh runtime | Observed | `login-mobile-393.jpg`, `login-desktop-1440.jpg` |
| `/register` | utworzenie konta | loaded | 393 | fresh runtime | Observed | `register-mobile-393.jpg` |
| `/onboarding` | utworzenie profilu | świeży profil | 393, 1024 | fresh runtime | Observed | `onboarding-mobile-393.jpg`, `onboarding-1024.jpg` |
| `/dashboard` | wybór następnej akcji i ocena tygodnia | empty, filled, readiness, active-session, touch geometry | 320, 393, 1440 | fresh runtime + emulator fixtures | Observed | `dashboard-empty-320.jpg`, `dashboard-filled-393.jpg`, `dashboard-active-393.jpg`, `dashboard-touch-targets-320.jpg` |
| `/progress` | zrozumienie trendu | empty, 90 dni, rok, rekordy i wykresy | 320, 393, 1440 | fresh runtime + emulator fixtures | Observed | `progress-empty-393.jpg`, `progress-filled-320.jpg`, `progress-year-393.jpg`, `progress-filled-1440.jpg` |
| `/templates` | znalezienie i uruchomienie planu | empty, seeded, expanded | 393, 1440 | fresh runtime + emulator fixtures | Observed | `templates-empty-393.jpg`, `templates-filled-393.jpg`, `templates-filled-1440.jpg` |
| `/templates/new` | utworzenie planu | empty editor | 393, 1024 | fresh runtime | Observed | `template-new-393.jpg`, `template-new-1024.jpg` |
| `/templates/:id/edit` | edycja planu | długi plan, pola liczbowe | 393, 1440 | fresh runtime + emulator fixture | Observed | `template-edit-operational-labels-393.jpg`, `template-edit-1440.jpg` |
| `/exercises` | znalezienie i zarządzanie ćwiczeniami | biblioteka, własne ćwiczenie, wybrany filtr | 320, 393, 1440 | fresh runtime + emulator fixture | Observed | `exercises-library-393.jpg`, `exercises-custom-320.jpg`, `exercises-filtered-nogi-393.jpg` |
| `/exercises/:source/:id` | analiza historii ćwiczenia | seeded history | 393, 1440 | fresh runtime + emulator fixture | Observed | `exercise-detail-393.jpg`, `exercise-detail-1440.jpg` |
| `/history` | skan ukończonych treningów | empty, grouped filled list | 393, 1440 | fresh runtime + emulator fixture | Observed | `history-empty-393.jpg`, `history-filled-393.jpg`, `history-filled-1440.jpg` |
| `/workout/new` | prowadzenie aktywnej sesji | empty, populated, completed set, timer, cancel confirmation | 320, 393, 1440 | fresh runtime + emulator fixture | Observed | `workout-empty-320.jpg`, `workout-active-operational-labels-320.jpg`, `workout-active-1440.jpg`, `workout-cancel-confirm-393.jpg` |
| `/workout/:id` | analiza ukończonego treningu | seeded detail | 393, 1440 | fresh runtime + emulator fixture | Observed | `workout-detail-393.jpg`, `workout-detail-1440.jpg` |
| `/chat` | konfiguracja/użycie Coacha | no-key locked/read-only | 393, 1440 | fresh runtime | Observed | `chat-no-key-393.jpg`, `chat-no-key-1440.jpg` |
| `/profile` | aktualizacja preferencji | loaded, keyboard focus | 393, 1024 | fresh runtime | Observed | `profile-393.jpg`, `profile-focus-393.jpg`, `profile-1024.jpg` |
| nieznana prywatna trasa | odzyskanie po złej nawigacji | in-shell 404 | 393, 1440 | fresh runtime | Observed | `not-found-393.jpg`, `not-found-1440.jpg` |
| `/` | wejście do aplikacji | authenticated redirect do `/dashboard` | 393 | fresh runtime | Observed | Browser URL assertion |
| `/logout` | wyjście | redirect do `/login` | 393 | fresh runtime | Observed | Browser URL assertion |
| prywatna trasa bez sesji | ochrona danych | redirect do `/login` | 393 | fresh runtime | Observed | Browser URL assertion |

## Kontrole przekrojowe

| Kontrola | Zakres | Wynik |
| --- | --- | --- |
| Poziomy overflow | wszystkie obserwowane kombinacje route/viewport | brak overflow |
| Fixed/sticky overlap | BottomNav, aktywny trening, dialog anulowania, edytor planu | brak zasłoniętej głównej akcji; full-page stitching powtarza fixed nav wyłącznie jako artefakt screenshotu |
| Touch geometry | 12 prywatnych tras przy 393 px + dashboard przy 320 px | wszystkie sprawdzone kontrolki >=44 px poza dwoma przyciskami dashboardu opisanymi w audycie |
| Essential typography | wszystkie prywatne trasy przy 393 px + aktywny trening 320 px | drobna metadata świadomie pominięta; operacyjne wyjątki 10,56–11,52 px opisane w audycie |
| Focus | Profil, dialog anulowania, shell keyboard checks | widoczny i niezasłonięty |
| Console | cała bieżąca sesja Browser | 0 warningów, 0 errorów |
| A11y/contrast/shell/mobile | desktop + mobile Playwright | 40 passed, 17 conditional skips, 0 failed |

## Granice pokrycia

- Nie wykonano prawdziwego zapytania AI ani nie zapisano klucza API; oceniono celowy stan `no-key` i read-only.
- Nie generowano produkcyjnego błędu sieciowego. Offline/error nie tworzy osobnej, krytycznej powierzchni dla znalezionych problemów; pozostaje pokryty istniejącymi testami zachowania, nie pikselami 5C.
- Dane emulatora były deterministyczne i jednorazowe; żaden zapis nie trafił do produkcji.
