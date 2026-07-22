# Faza 6B — Poprawność i koszt kontekstu AI

**Status:** projekt zatwierdzony — oczekuje na przegląd zapisanego speca

**Data:** 2026-07-22

**Właściciel zakresu:** `AI-01`, `AI-09`, `AI-10`, `AI-11` z `docs/roadmap/ROADMAP.md`

**Route:** Medium — skoordynowana zmiana loadera kontekstu, promptów, kontraktu HTTP i dwóch powierzchni UI

**Ryzyko:** Elevated — błędna klasyfikacja dostępności może prowadzić do odpowiedzi opartych na fałszywie pustym obrazie użytkownika; zmiana wpływa również na koszt odczytów Firestore

## 1. Cel

Faza 6B zapewnia, że częściowa awaria danych nie usuwa poprawnie załadowanej reszty kontekstu i nie jest przedstawiana jako prawidłowy brak danych. Rozmowa oraz generator planu nadal działają na dostępnych źródłach, a użytkownik widzi przy konkretnej odpowiedzi lub planie, których danych zabrakło.

Faza ogranicza także budowę czterech podstawowych źródeł kontekstu do maksymalnie 69 odczytów dokumentów na request oraz naprawia sygnał niskiego readiness tak, aby „dni z rzędu” oznaczały kolejne daty kalendarzowe.

## 2. Potwierdzony stan wejściowy

Obecny `api/ai-chat.ts` ładuje równolegle:

- jeden dokument profilu;
- 32 dokumenty readiness przez osobne `get()` po identyfikatorze;
- do 60 dokumentów workoutów;
- do 100 dokumentów rekordów.

Maksymalny koszt samego podstawowego kontekstu wynosi 193 odczyty dokumentów na request. Wszystkie cztery operacje znajdują się we wspólnym `Promise.all`. Błąd dowolnego źródła przechodzi przez jeden `catch`, loguje ogólny błąd i zastępuje cały wynik `createEmptyAiUserContext()`.

W konsekwencji:

- awaria rekordów może usunąć poprawny profil, readiness i treningi;
- prompt używa tekstów „brak danych”, mimo że odczyt faktycznie się nie udał;
- klient nie otrzymuje informacji o jakości kontekstu;
- UI nie może przypisać ograniczeń do konkretnej odpowiedzi lub planu;
- `findLowReadinessStreak` liczy kolejne niskie wpisy w posortowanej tablicy, ale nie sprawdza, czy ich pola `date` są kolejnymi dniami kalendarzowymi.

Ten sam podstawowy kontekst zasila tryb rozmowy i generator planu. Katalog ćwiczeń generatora jest osobnym zbiorem danych i nie należy do czterech źródeł objętych budżetem Fazy 6B.

## 3. Decyzje produktowe

### 3.1 Częściowa awaria

Profil, readiness, treningi i rekordy są niezależnymi źródłami. Każde otrzymuje status:

```ts
type AiContextSourceStatus = 'available' | 'unavailable'
```

Poprawnie wykonany odczyt bez dokumentów ma status `available`. Wyłącznie odrzucony odczyt ma status `unavailable`.

Jeżeli co najmniej jedno źródło jest dostępne:

- rozmowa nadal generuje odpowiedź;
- generator planu nadal generuje plan;
- prompt używa poprawnie załadowanych danych;
- niedostępne źródła są jawnie oznaczone w prompcie;
- UI pokazuje ostrzeżenie przypisane do konkretnego wyniku.

### 3.2 Całkowita awaria

Jeżeli wszystkie cztery źródła mają status `unavailable`, endpoint nie wywołuje Claude API. Zwraca odzyskiwalny błąd HTTP z komunikatem:

```text
Nie udało się załadować kontekstu. Spróbuj ponownie.
```

W rozmowie błąd korzysta z istniejącej akcji `Ponów odpowiedź AI`. W generatorze planu korzysta z istniejącego stanu błędu formularza i ponownego submitu.

### 3.3 Widoczność w UI

Pełny kontekst nie dodaje badge'a ani komunikatu. Ograniczony kontekst pokazuje spokojny status, na przykład:

```text
Odpowiedź powstała bez części danych: gotowości i rekordów.
```

Dla planu copy używa rzeczownika „Plan”. Komunikat:

- pojawia się podczas streamu, gdy klient otrzyma nagłówki odpowiedzi;
- po poprawnym `done` zostaje przypisany do wiadomości asystenta;
- przy planie znajduje się nad konkretnym podglądem;
- znika razem z resetowaną rozmową albo zamkniętym podglądem planu;
- używa `role="status"`, ponieważ jest ważną informacją, ale nie błędem wymagającym natychmiastowej reakcji.

Całkowita awaria pozostaje błędem i używa istniejącej semantyki `role="alert"`.

### 3.4 Znaczenie „dni z rzędu”

Sygnał niskiego readiness używa najdłuższej serii w objętym 30-dniowym oknie. Seria istnieje tylko wtedy, gdy:

- każdy wpis ma poprawne `date` w formacie `YYYY-MM-DD`;
- kolejne niskie wpisy różnią się dokładnie o jeden dzień kalendarzowy;
- każdy wynik ma score poniżej 55.

Brak wpisu, luka daty, niepoprawna data albo score co najmniej 55 przerywa serię. `createdAt` nadal wybiera najnowszy wpis readiness i ogranicza okno czasowe, ale nie dowodzi ciągłości kalendarzowej.

## 4. Wybrane podejście

Serwer składa dane i metadane w jeden wewnętrzny kontrakt:

```ts
type AiContextSource = 'profile' | 'readiness' | 'workouts' | 'records'

interface AiContextEnvelope {
  context: AiUserContext
  sources: Record<AiContextSource, AiContextSourceStatus>
}
```

Cztery loadery wykonują się przez `Promise.allSettled` albo równoważny mechanizm zachowujący niezależny wynik każdego źródła. `server/aiContext.ts` pozostaje czystą warstwą normalizacji i analizy, ale budowanie sekcji promptu otrzymuje również statusy źródeł.

Metadane docierają do klienta w jednym nagłówku HTTP. To zachowuje trzytypowy protokół NDJSON z Fazy 6A i nie zmienia JSON-owego shape'u planu.

Odrzucone alternatywy:

- dodatkowa ramka NDJSON i osobne pole w odpowiedzi planu rozszerzałyby dwa kontrakty transportowe;
- osobny endpoint preflight tworzyłby drugi request, ryzyko podwójnych odczytów i możliwość rozjazdu statusu między preflightem a generacją;
- cache albo dodatkowa kolekcja agregacyjna nie są potrzebne do osiągnięcia zaakceptowanego budżetu.

## 5. Kontrakt dostępności źródeł

### 5.1 Loader

Każdy loader zwraca własny surowy wynik. Warstwa składająca:

1. zachowuje wartości spełnionych promise'ów;
2. dla odrzuconego źródła przekazuje neutralną wartość wejściową do buildera;
3. zapisuje `unavailable` wyłącznie dla odrzuconego źródła;
4. loguje bezpieczną diagnostykę źródła;
5. odrzuca cały request przed Claude API tylko wtedy, gdy wszystkie źródła są niedostępne.

Nie powstaje ogólny framework ładowania danych. Kontrakt jest lokalny dla kontekstu AI.

### 5.2 Analizy pochodne

Status źródła steruje analizami, które wolno wyprowadzić:

- dane profilu są prezentowane tylko przy dostępnym profilu;
- latest readiness i seria niskiego readiness wymagają dostępnego readiness;
- cztery ostatnie sesje, liczby miesięczne, słabsze tygodnie i częstotliwość ćwiczeń wymagają dostępnych workoutów;
- top rekordy wymagają dostępnych rekordów;
- rekomendacja zależna od kilku źródeł powstaje tylko wtedy, gdy wszystkie wymagane wejścia są dostępne.

Przy źródle dostępnym, ale pustym, prompt zachowuje prawdziwe komunikaty typu „Brak ostatnich treningów”. Przy źródle niedostępnym używa komunikatu typu „Historia treningów: dane chwilowo niedostępne”. Model otrzymuje instrukcję, aby nie interpretować niedostępności jako braku aktywności użytkownika.

## 6. Budżet odczytów

Budżet obejmuje wyłącznie cztery podstawowe źródła kontekstu `profile`, `readiness`, `workouts` i `records`:

| Źródło | Query | Maksymalna liczba dokumentów |
|---|---|---:|
| Profil | `users/{uid}` | 1 |
| Readiness | `userId == uid`, `date desc`, limit 31 | 31 |
| Treningi | `userId == uid`, `startedAt desc`, limit 31 | 31 |
| Rekordy | `userId == uid`, `maxWeight desc`, limit 6 | 6 |
| **Razem** |  | **69** |

Limity są nazwanymi stałymi i mają test kontraktowy potwierdzający sumę nie większą niż 70.

Jeden wynik workoutów obsługuje równocześnie:

- cztery ostatnie szczegółowe sesje;
- 30-dniową liczbę sesji;
- sumę i średnią objętości;
- tygodniowe buckety;
- częstotliwość ćwiczeń.

Nie wykonujemy drugiego query dla statystyk miesięcznych. Readiness wykorzystuje jedno query zamiast 31 osobnych odczytów po znanych identyfikatorach. Rekordy są ograniczane i sortowane przez Firestore zamiast pobierania do 100 dokumentów i sortowania całego wyniku w pamięci.

Budżet nie obejmuje katalogu `userExercises` używanego wyłącznie przez generator planu. Jego jakość i walidacja należą do kontraktu generatora oraz Fazy 6C; Faza 6B nie dodaje mu nowych odczytów.

## 7. Indeksy Firestore

Istniejący indeks `workouts(userId ASC, startedAt DESC)` pozostaje bez zmian. Faza dodaje do `firestore.indexes.json`:

- `readiness(userId ASC, date DESC)`;
- `records(userId ASC, maxWeight DESC)`.

Publikacja indeksów produkcyjnych pozostaje czynnością `RELEASE-08`. Przyszły rollout musi zachować kolejność:

1. opublikować i poczekać na gotowość indeksów;
2. wdrożyć API i SPA korzystające z nowych query;
3. wykonać smoke rozmowy i generatora planu.

## 8. Kontrakt HTTP

Endpoint ustawia nagłówek:

```text
X-IronLog-AI-Context: full
```

albo:

```text
X-IronLog-AI-Context: limited;unavailable=readiness,records
```

Lista źródeł:

- używa wyłącznie identyfikatorów `profile`, `readiness`, `workouts`, `records`;
- jest unikalna;
- zachowuje stałą kolejność kanoniczną;
- przy `limited` zawiera co najmniej jedno i najwyżej trzy źródła.

Cztery niedostępne źródła prowadzą do błędu HTTP przed wywołaniem modelu, więc nie są poprawnym wariantem nagłówka `limited`.

Klient traktuje brak nagłówka, nieznany status, nieznane źródło, duplikat albo niepoprawną składnię jako błąd kontraktu. Nie wolno domyślnie przyjąć pełnego kontekstu. Lokalny CORS eksponuje ten nagłówek klientowi; produkcja pozostaje same-origin.

## 9. Architektura klienta

### 9.1 Usługa

`src/lib/chatService.ts` definiuje mały parser nagłówka i wspólny typ metadanych kontekstu.

Dla streamu parser działa po otrzymaniu odpowiedzi HTTP, przed czytaniem pierwszej ramki NDJSON. `streamChatReply` informuje `ChatPage` o statusie przez callback skojarzony z bieżącą generacją. Po `done` te same metadane trafiają do zapisanej wiadomości asystenta.

Dla generatora planu `generateTrainingPlan` zwraca plan wraz z tym samym typem metadanych, mimo że body endpointu nadal ma istniejący shape `{ plan }`.

### 9.2 Stan strony

Wiadomość asystenta może mieć opcjonalną listę niedostępnych źródeł. Brak listy oznacza brak komunikatu UI, ale nie służy parserowi transportu jako fallback dla brakującego nagłówka.

Aktywna generacja zachowuje metadane wyłącznie dla własnego `generationId`. Spóźniony callback z anulowanej albo zastąpionej generacji nie może zmienić ostrzeżenia kolejnej odpowiedzi.

Podgląd planu zachowuje własne metadane. Nowa generacja, zamknięcie podglądu lub reset odpowiedniego stanu usuwa poprzednie ostrzeżenie.

### 9.3 Prezentacja

Komunikat powstaje lokalnie w `ChatPage` z polskich etykiet źródeł:

- `profile` → `profilu`;
- `readiness` → `gotowości`;
- `workouts` → `treningów`;
- `records` → `rekordów`.

Nie powstaje nowy globalny system alertów ani osobny ekran statusu. Boczne panele zachowują swój informacyjny charakter; stan konkretnej generacji pozostaje przy jej wyniku.

## 10. Logowanie i prywatność

Dla odrzuconego źródła serwer może zalogować wyłącznie:

- stały identyfikator źródła;
- nazwę klasy błędu albo bezpieczny kod techniczny.

Log nie zawiera treści dokumentów, promptu, wiadomości, odpowiedzi, UID, adresu e-mail ani klucza Claude API. Oczekiwane częściowe awarie nie są ukrywane, ale jeden błąd nie produkuje wielu zduplikowanych logów.

## 11. Obsługa błędów

- Pojedynczy loader odrzucony: generacja trwa z ostrzeżeniem `limited`.
- Loader spełniony pustym wynikiem: generacja trwa jako `available` dla tego źródła.
- Wszystkie loadery odrzucone: brak wywołania Anthropic, odzyskiwalny błąd HTTP.
- Brak lub błędny nagłówek: klient zatrzymuje wynik jako błąd kontraktu.
- Błąd streamu po częściowej treści: obowiązuje kontrakt Fazy 6A; częściowa odpowiedź jest odrzucana razem z jej tymczasowym ostrzeżeniem.
- Abort resetu, zmiany trybu albo unmount: obowiązuje kontrakt Fazy 6A i nie powstaje spóźniony status kontekstu.

## 12. Testy

### 12.1 Czysta logika kontekstu

Testy `server/aiContext.ts` obejmują:

- puste dostępne źródło i niedostępne źródło jako dwa różne wyniki promptu;
- pomijanie analiz pochodnych zależnych od niedostępnego źródła;
- dwie kolejne niskie daty tworzące serię;
- dwie niskie, ale niekolejne daty bez sygnału „dni z rzędu”;
- wysoki score, luka i niepoprawna data przerywające serię;
- ciągłość dat przez granicę miesiąca i roku.

### 12.2 Loader i koszt

Testy serwera obejmują:

- sukces wszystkich czterech źródeł;
- osobną awarię każdego źródła;
- kilka awarii z co najmniej jednym dostępnym źródłem;
- awarię wszystkich źródeł;
- puste snapshoty zachowujące `available`;
- limity 1 + 31 + 31 + 6 oraz sumę nie większą niż 70.

### 12.3 API

Testy endpointu potwierdzają:

- `full` przy czterech dostępnych źródłach;
- kanoniczny `limited` dla każdej pojedynczej awarii;
- przekazanie dostępnych sekcji do promptu przy częściowej awarii;
- brak wywołania Anthropic przy czterech awariach;
- zachowanie dotychczasowego protokołu NDJSON `chunk | done | error`;
- zachowanie shape'u `{ plan }` w body generatora.

### 12.4 Klient i UI

Testy klienta oraz `ChatPage` obejmują:

- poprawne parsowanie `full` i `limited`;
- odrzucenie brakującego, błędnego albo nieznanego nagłówka;
- komunikat podczas streamu i przy ukończonej odpowiedzi;
- brak komunikatu przy pełnym kontekście;
- ostrzeżenie nad podglądem planu;
- usunięcie ostrzeżenia przy resetowaniu właściwego wyniku;
- brak spóźnionej aktualizacji po abort lub supersede;
- odzyskiwalny błąd przy całkowitej awarii.

### 12.5 E2E i obserwacja runtime

Deterministyczny mock AI otrzymuje obsługę nagłówka bez prawdziwego klucza i requestu Anthropic. Playwright obejmuje:

- ograniczony kontekst rozmowy;
- ograniczony kontekst planu;
- retry po całkowitej awarii kontekstu.

Bezpośrednia obserwacja runtime potwierdza czytelność i przypisanie ostrzeżenia do odpowiedzi oraz planu. Screenshot albo render powłoki nie zamyka tej bramki samodzielnie.

## 13. Zakres plików

Przewidywane główne obszary zmiany:

- `api/ai-chat.ts` — niezależne odczyty, budżet, nagłówek i całkowita awaria;
- `server/aiContext.ts` — statusy źródeł, bezpieczne sekcje promptu i seria dat;
- `src/lib/chatService.ts` — parser nagłówka i przekazanie metadanych;
- `src/pages/ChatPage.tsx` — stan i prezentacja ostrzeżeń;
- `firestore.indexes.json` — dwa indeksy;
- istniejące testy server/API/client/UI/E2E.

Plan implementacyjny może wydzielić lokalny plik serwerowy dla loadera, jeśli dzięki temu test kosztu nie będzie zależał od handlera HTTP. Nie jest to zgoda na ogólny framework repository ani refaktor niezwiązanych usług.

## 14. Poza zakresem

- walidacja zgodności wygenerowanego planu z briefem i sprzętem (`AI-12`, Faza 6C);
- klasyfikacja invalid key, modelu, limitu i błędów upstreamu (`AI-04`, `AI-13`, Faza 6C);
- UX konfiguracji klucza na mobile (`AI-14`, Faza 6C);
- trwała historia rozmowy;
- cache kontekstu, agregaty Firestore i nowe kolekcje;
- zmiana dziennego lub minutowego limitu AI;
- zmiana budżetu albo zawartości katalogu `userExercises` generatora planu;
- push, deploy, publikacja indeksów i czynności `RELEASE-08`.

## 15. Rollout i recovery

Implementacja nie wymaga migracji istniejących dokumentów ani compatibility layer. Kod i testy mogą zostać zintegrowane lokalnie przed produkcyjną publikacją indeksów.

Produkcja wymaga gotowych indeksów przed wdrożeniem API. Jeżeli indeks nie jest gotowy, deploy pozostaje zablokowany zamiast powrotu do drogiego query lub fałszywie pustego kontekstu.

Recovery to zwykły revert commitów Fazy 6B. Opublikowane indeksy mogą pozostać, ponieważ nie zmieniają danych ani zachowania starszego kodu.

## 16. Kryteria akceptacji

Faza 6B jest gotowa do zamknięcia, gdy:

1. każda pojedyncza awaria źródła zachowuje dane z pozostałych źródeł;
2. pusty poprawny wynik nigdy nie jest oznaczony jako awaria;
3. prompt jawnie rozróżnia brak danych od niedostępnego źródła;
4. odpowiedź i plan pokazują niedostępne źródła przy właściwym wyniku;
5. pełny kontekst nie dodaje zbędnego komunikatu;
6. całkowita awaria nie wywołuje Claude API i oferuje retry;
7. podstawowy kontekst wykonuje najwyżej 69 odczytów dokumentów;
8. sygnał „dni z rzędu” wymaga kolejnych dat kalendarzowych;
9. logi nie zawierają danych użytkownika, promptu, odpowiedzi ani klucza;
10. focused testy, pełny unit/support, lint i build przechodzą;
11. deterministyczny Playwright i bezpośrednia obserwacja potwierdzają oba ostrzeżenia oraz recovery;
12. roadmapa, spec, plan i pamięć zostają zaktualizowane dopiero zgodnie z rzeczywistym stanem integracji;
13. push, deploy, publikacja indeksów i `RELEASE-08` nie są wykonywane bez osobnej zgody.
