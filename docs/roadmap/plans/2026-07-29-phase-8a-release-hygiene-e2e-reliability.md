# Faza 8A — higiena release i wiarygodność E2E

**Status:** COMPLETED — VERIFIED — INTEGRATED LOCALLY
**Roadmapa:** `HYGIENE-01`, `HYGIENE-02`, `TEST-GATE-01`, `TEST-GATE-02`
**Data:** 2026-07-29

## 1. Cel

Usunąć lokalne i publiczne artefakty powstałe podczas pracy przeglądarkowej oraz przywrócić testom E2E zgodność z aktualnym interfejsem bez przebudowy harnessu.

Po fazie:

- stan logowania i pliki Playwright CLI nie mogą przypadkiem trafić do Gita;
- robocze preview nie mogą trafiać do produkcyjnego bundle'a;
- wspólny readiness helper ma sprawdzać funkcjonalny kontrakt strony zamiast dekoracyjnej interpunkcji;
- focused E2E ma przechodzić na świeżych emulatorach bez retry.

## 2. Potwierdzony stan wejściowy

- `.gitignore` wyklucza `tests/e2e/.auth/`, ale nie wyklucza `.playwright-cli/`.
- `.playwright-cli/dashboard-auth.json` zawiera lokalny storage state; cały katalog jest nieśledzony i nie występuje w historii Git.
- `public/__preview.html` i `public/__variant-shot.png` są nieśledzone, ale Vite kopiuje je do produkcyjnego `dist/`.
- Aktualne nagłówki to: `Plany`, `Nowy plan`, `Biblioteka`, `Coach`, `Twój profil` i `Postępy`.
- `tests/e2e/support/appReady.ts` nadal oczekuje kilku historycznych nagłówków zakończonych kropką.
- Stara interpunkcja występuje również bezpośrednio w:
  - `tests/e2e/progress.spec.ts`;
  - `tests/e2e/templates.spec.ts`;
  - `tests/e2e/template-launch.spec.ts`.

Ponieważ wrażliwy plik nie był śledzony ani obecny w historii Git, faza nie wymaga rotacji sesji. Rotacja wraca do zakresu tylko po pojawieniu się dowodu, że plik został wysłany poza lokalną maszynę.

## 3. Zakres i pliki

**Modyfikowane:**

- `.gitignore`
- `tests/e2e/support/appReady.ts`
- `tests/e2e/progress.spec.ts`
- `tests/e2e/templates.spec.ts`
- `tests/e2e/template-launch.spec.ts`
- `docs/roadmap/ROADMAP.md`
- ten plan

**Usuwane:**

- `.playwright-cli/`
- `public/__preview.html`
- `public/__variant-shot.png`

**Poza zakresem:**

- zmiany komponentów i copy aplikacji;
- nowy framework readiness albo masowe `data-testid`;
- zmiana globalnej konfiguracji retry Playwright;
- cleanup `.impeccable/`, `output/` i innych artefaktów, których audyt nie wskazał jako publicznych lub wrażliwych;
- push, merge i deploy.

## 4. Docelowy kontrakt readiness

`expectAppReady` zawsze najpierw potwierdza URL. Następnie sprawdza istniejący funkcjonalny element właściwy dla strony oraz brak pełnoekranowego błędu, jeżeli taki kontrakt już istnieje.

Dokładny tekst nagłówka pozostaje asercją tylko tam, gdzie test rzeczywiście weryfikuje copy. Dla tras, których gotowość jest już jednoznacznie określona przez kontrolkę lub stan danych:

- `/templates`: przycisk `Nowy plan` i brak błędu ładowania;
- `/templates/new`: pole nazwy planu;
- `/exercises`: wyszukiwarka i `data-load-state="ready"`;
- `/chat`: `Status AI Coacha`;
- `/profile`: pole imienia i brak błędu profilu;
- `/progress`: istniejące `aria-busy="false"`, zakres danych i brak błędu.

Nie dodajemy nowych selektorów do aplikacji, ponieważ obecne semantyczne kontrolki już rozróżniają te ekrany.

## 5. Plan wykonania

### Task 1 — zabezpieczenie i usunięcie lokalnych artefaktów

1. Dodać `.playwright-cli/` do sekcji Playwright w `.gitignore`.
2. Potwierdzić jeszcze raz przez `git log --all --`, że `.playwright-cli/` nie występował w historii.
3. Usunąć dokładnie katalog `.playwright-cli/`.
4. Potwierdzić:
   - katalog nie istnieje;
   - `git check-ignore .playwright-cli/dashboard-auth.json` zwraca sukces dla hipotetycznej ścieżki;
   - `git status` nie pokazuje plików z tego katalogu.

**Warunek bezpieczeństwa:** nie wyświetlać zawartości `dashboard-auth.json` w terminalu ani raporcie.

### Task 2 — usunięcie publicznych artefaktów review

1. Usunąć dokładnie:
   - `public/__preview.html`;
   - `public/__variant-shot.png`.
2. Nie usuwać `public/favicon.svg` ani `public/icons.svg`.
3. Po buildzie potwierdzić brak obu nazw w `dist/`.

Artefakty są odtwarzalne i nieśledzone, dlatego nie tworzymy dla nich kolejnego archiwum w repo.

### Task 3 — naprawa wspólnego readiness

1. W `tests/e2e/support/appReady.ts` usunąć zależność od nagłówków dekoracyjnych dla `/templates`, `/templates/new`, `/exercises`, `/chat` i `/profile`.
2. Zachować aktualne funkcjonalne asercje wymienione w sekcji 4.
3. Nie osłabiać istniejących kontroli błędów ani stanów ładowania.
4. Nie zmieniać kontraktów `/login`, `/dashboard`, `/history`, `/progress`, `/workout/new` ani detailu ćwiczenia poza poprawką konieczną do kompilacji.

### Task 4 — usunięcie bezpośrednich starych lokatorów

1. W `tests/e2e/progress.spec.ts` zmienić nagłówek `Postępy.` na aktualne `Postępy`; pozostałe asercje analityki pozostają bez zmian.
2. W `tests/e2e/templates.spec.ts` zastąpić lokalny helper oparty na `Plany.` wywołaniem istniejącego `expectAppReady(page, '/templates')`.
3. W `tests/e2e/template-launch.spec.ts` zastąpić trzy asercje `Plany.` wywołaniem tego samego helpera.
4. Uruchomić `rg` dla historycznych nazw zakończonych kropką i potwierdzić brak pozostałości w E2E.

### Task 5 — focused verification

Uruchomić na emulatorach Auth i Firestore, bez produkcyjnych sekretów:

```bash
E2E_BACKEND=emulator \
TEST_EMAIL=e2e@ironlog.local \
TEST_PASSWORD=ironlog-e2e \
firebase emulators:exec \
  --only auth,firestore \
  --project demo-ironlog \
  "npx playwright test \
    tests/e2e/critical.spec.ts \
    tests/e2e/progress.spec.ts \
    tests/e2e/templates.spec.ts \
    tests/e2e/template-launch.spec.ts \
    tests/e2e/smoke.spec.ts \
    --project=desktop \
    --project=mobile \
    --retries=0"
```

Oczekiwany wynik:

- brak porażek w `expectAppReady`;
- brak porażek wynikających ze starej interpunkcji;
- brak nieoczekiwanych błędów przeglądarki;
- wszystkie mutacje zostają posprzątane przez istniejące cleanup fixtures.

Jeżeli test ujawni inny błąd produktu, zatrzymać fazę i sklasyfikować go zamiast poszerzać 8A bez aktualizacji roadmapy.

### Task 6 — statyczna bramka i closeout

Uruchomić:

```bash
npm run lint
npm run test:unit
npm run build
test ! -e dist/__preview.html
test ! -e dist/__variant-shot.png
git diff --check
```

Następnie:

1. ustawić Fazę 8A na `DONE` w roadmapie;
2. uzupełnić w tym pliku status i rzeczywiste wyniki;
3. wykonać niezależny review zakresu 8A;
4. utworzyć jeden commit obejmujący wyłącznie tę fazę po osobnej zgodzie użytkownika.

## 6. Kryteria akceptacji

- `.playwright-cli/` nie istnieje lokalnie i jest ignorowany;
- w repo ani historii nie ma storage state z tego katalogu;
- publiczne preview nie istnieją w `public/` ani `dist/`;
- readiness nie zależy od dekoracyjnej kropki w nagłówku;
- focused desktop/mobile E2E przechodzi na emulatorach z `--retries=0`;
- lint, unit, build i `git diff --check` przechodzą;
- nie zmieniono UI, logiki produktu ani konfiguracji produkcyjnej.

## 7. Rollback

- Przywrócić wyłącznie zmiany testów i `.gitignore` z commita Fazy 8A.
- Nie przywracać `dashboard-auth.json`; poprawny storage state odtworzy `global.setup.ts`.
- Robocze preview można ponownie wygenerować poza `public/`, jeśli będzie potrzebne do przyszłego review.

## 8. Wynik wykonania

- `.playwright-cli/` usunięto z workspace i dodano do `.gitignore`; Git potwierdził brak katalogu w historii.
- `public/__preview.html` i `public/__variant-shot.png` usunięto z katalogu publikowanego. Build nie zawiera obu plików.
- `expectAppReady` używa istniejących kontraktów funkcjonalnych dla Planów, edytora, biblioteki, Coacha i profilu.
- Bezpośrednie stare lokatory poprawiono w testach Progress, Planów i uruchamiania planu.
- Focused E2E na emulatorach, desktop + mobile, `--retries=0`: **43 passed, 4 viewport skips, 0 failed**.
- Unit: **60 plików, 472 testy — PASS**.
- Lint: **PASS**.
- Build: **PASS, 878 modułów**.
- Kontrola `dist/`, wyszukiwanie starych nagłówków i `git diff --check`: **PASS**.
- Review końcowy: brak znalezisk i brak zmian poza uzgodnionym zakresem 8A.

**Integracja:** wykonana na `main` jako jeden ścieżkowo ograniczony commit obejmujący wyłącznie `.gitignore`, cztery pliki E2E oraz kanoniczne artefakty roadmapy. Równoległe zmiany UI pozostały poza commitem.
