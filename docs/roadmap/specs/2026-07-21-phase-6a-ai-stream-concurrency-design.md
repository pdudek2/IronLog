# Faza 6A — Stream i concurrency AI

**Status:** zatwierdzony — plan wdrożenia gotowy

**Data:** 2026-07-21

**Właściciel zakresu:** `AI-07`, `AI-08` z `docs/roadmap/ROADMAP.md`

## 1. Cel

Faza 6A zapewnia bezpieczny lifecycle pojedynczej odpowiedzi strumieniowej AI. Reset rozmowy, zmiana trybu i opuszczenie ekranu nie mogą pozostawić aktywnego requestu ani dopuścić do późniejszej aktualizacji nieaktualnego stanu. Odpowiedź asystenta staje się częścią rozmowy wyłącznie po jawnym, poprawnym zakończeniu streamu.

Faza zamyka dwa potwierdzone punkty roadmapy:

- `AI-07`: anulowanie requestu i unieważnianie starej generacji;
- `AI-08`: jawny terminal `done` lub `error`, także po rozpoczęciu odpowiedzi HTTP 200.

## 2. Potwierdzony stan wejściowy

Obecny klient w `src/lib/chatService.ts` traktuje zamknięcie body odpowiedzi jako sukces. Nie przekazuje `AbortSignal` do `fetch` ani czytnika streamu.

Obecny `src/pages/ChatPage.tsx`:

- dodaje pytanie użytkownika przed rozpoczęciem requestu;
- pokazuje fragmenty odpowiedzi w `streamText`;
- po resolve zapisuje wynik jako wiadomość asystenta;
- nie posiada identyfikatora generacji ani `AbortController`;
- Reset czyści stan UI, lecz nie anuluje requestu;
- zmiana trybu i unmount nie unieważniają aktywnej generacji.

Obecny `api/ai-chat.ts` tłumaczy Anthropic SSE na surowy `text/plain`. Błąd czytnika jest logowany i połykany, po czym odpowiedź zostaje zakończona jak sukces. Klient nie może odróżnić pełnej odpowiedzi od częściowego tekstu przerwanego po HTTP 200.

Historia Gita potwierdza, że jest to wcześniejszy dług istniejący od kwietnia 2026 roku, a nie regresja wprowadzona przez Fazę 5.

## 3. Decyzje produktowe

### 3.1 Błąd po rozpoczęciu odpowiedzi

Jeżeli stream zwrócił część tekstu, a następnie zakończył się błędem:

- częściowa odpowiedź asystenta zostaje w całości odrzucona;
- pytanie użytkownika pozostaje w rozmowie;
- UI pokazuje dostępny komunikat błędu i akcję `Ponów`;
- częściowy tekst nie jest traktowany jako poprawna wiadomość ani używany jako kontekst kolejnego requestu.

### 3.2 Zmiana trybu

Przełączenie z `Rozmowa` do `Plan` podczas streamu:

- anuluje aktywny request;
- odrzuca tymczasową odpowiedź;
- zachowuje pytanie użytkownika;
- po powrocie do rozmowy pokazuje neutralny stan `Generowanie przerwane` i akcję `Ponów`.

Zmiana trybu pozostaje dostępna podczas generowania. Nie blokujemy użytkownika do czasu zakończenia requestu.

### 3.3 Reset

Reset podczas streamu natychmiast:

- anuluje request;
- unieważnia bieżącą generację;
- czyści rozmowę, podgląd i stan błędu lub przerwania;
- nie pokazuje dialogu potwierdzenia ani komunikatu o błędzie.

Reset jest świadomą akcją użytkownika, dlatego oczekiwany abort nie jest błędem produktowym.

### 3.4 Ponowienie

Akcja `Ponów`:

- ponawia dokładnie ostatnie pytanie w tym samym, niezmienionym kontekście rozmowy;
- nie dodaje drugiej identycznej wiadomości użytkownika;
- usuwa poprzedni stan `failed` lub `interrupted`;
- tworzy nową generację z nowym identyfikatorem i `AbortController`.

## 4. Wybrane podejście

Warstwa IronLog użyje NDJSON nad istniejącym wywołaniem `fetch` POST. Podejście zachowuje obecną autoryzację, body requestu i architekturę Vercel Function, a jednocześnie zapewnia jawne i łatwe do testowania ramki protokołu.

Odrzucone alternatywy:

- SSE po stronie IronLog nie daje istotnej przewagi przy obecnym POST i nadal wymaga własnego parsera klienta;
- znaczniki w `text/plain`, takie jak `[DONE]`, są podatne na kolizje z treścią i podział między chunki sieciowe.

## 5. Kontrakt NDJSON

Endpoint czatu odpowiada nagłówkiem:

```text
Content-Type: application/x-ndjson; charset=utf-8
Cache-Control: no-store
```

Każda ramka jest pojedynczym obiektem JSON zakończonym znakiem nowej linii. Protokół ma trzy dozwolone typy ramek:

```json
{"type":"chunk","text":"Fragment odpowiedzi"}
{"type":"done"}
{"type":"error","message":"Nie udało się dokończyć odpowiedzi."}
```

Obowiązują następujące inwarianty:

1. `chunk` może wystąpić zero lub więcej razy przed terminalem.
2. `done` występuje dokładnie raz i wyłącznie po poprawnym `message_stop` upstreamu.
3. `error` jest terminalem i nie może współwystąpić z `done`.
4. EOF bez `done` lub `error` jest niepoprawnym, przerwanym streamem.
5. Niepoprawna linia NDJSON jest błędem protokołu, nigdy treścią odpowiedzi.
6. Odpowiedź bez żadnej treści, zakończona przez upstream bez poprawnej zawartości, kończy się `error`, a nie syntetyczną wiadomością asystenta.

Błędy wykryte przed rozpoczęciem streamu nadal korzystają z odpowiedniego statusu HTTP i istniejącej odpowiedzi JSON. Gdy nagłówki HTTP 200 zostały już wysłane, błąd jest przekazywany ramką NDJSON `error`.

Szczegółowe kody i klasyfikacja `invalid key`, limitu, modelu oraz niedostępności upstreamu należą do Fazy 6C. Faza 6A gwarantuje poprawny terminal, ale nie rozszerza klasyfikacji błędów konfiguracyjnych.

## 6. Architektura klienta

### 6.1 Parser streamu

`src/lib/chatService.ts` pozostaje publiczną granicą usługi czatu. `streamChatReply` otrzymuje dodatkowo `AbortSignal` i przekazuje go do `fetch`.

Parser klienta:

- buforuje tekst pomiędzy odczytami, ponieważ jedna linia NDJSON może być podzielona między dowolne chunki transportowe;
- waliduje każdą kompletną linię;
- przekazuje `chunk.text` do `onChunk`;
- zwraca pełną odpowiedź dopiero po `done`;
- rzuca kontrolowany błąd po ramce `error`, błędnej ramce, EOF bez terminala albo braku body;
- kończy czytnik po abort i nie zamienia `AbortError` w zwykły błąd upstreamu.

Logika dekodowania powinna być odizolowana od Firebase Auth i transportu HTTP tak, aby można ją było testować deterministycznie za pomocą sztucznego `ReadableStream`.

### 6.2 Właściciel lifecycle

`ChatPage.tsx` jest właścicielem pojedynczej aktywnej generacji. Referencja aktywnej generacji przechowuje co najmniej:

- unikalne `generationId`;
- `AbortController`;
- identyfikator pytania użytkownika;
- lokalny powód anulowania: `reset`, `mode-change`, `unmount` albo zastąpienie requestu.

Każdy `onChunk`, `then`, `catch` i `finally` sprawdza, czy jego `generationId` nadal jest aktywny. Samo wywołanie `abort()` nie jest wystarczającą ochroną, ponieważ stary promise lub callback może rozstrzygnąć się po zmianie stanu.

### 6.3 Stany UI

Lifecycle rozmowy używa czterech jawnych stanów:

- `idle` — brak aktywnego requestu;
- `streaming` — request trwa, a tekst jest tylko tymczasowym podglądem;
- `interrupted` — użytkownik przerwał generowanie zmianą trybu;
- `failed` — request lub protokół zakończył się błędem.

Stan `interrupted` jest neutralnym komunikatem statusowym. Stan `failed` jest ogłaszanym komunikatem błędu. Oba odnoszą się do ostatniego niezakończonego pytania i udostępniają `Ponów`.

Podczas `streaming` edytor i wysłanie kolejnego pytania pozostają zablokowane zgodnie z obecnym zachowaniem. Zmiana trybu oraz Reset pozostają dostępne.

### 6.4 Commit odpowiedzi

Pytanie użytkownika jest dodawane optymistycznie przed requestem. Chunks są przechowywane wyłącznie w stanie tymczasowym. Wiadomość asystenta zostaje dodana do `messages` dopiero po poprawnym `done` i tylko wtedy, gdy generacja nadal jest aktywna.

Po `error`, niepoprawnym EOF albo zmianie trybu tymczasowy tekst jest czyszczony. Po Reset i unmount wynik starego requestu jest całkowicie ignorowany. `finally` starego requestu nie może ustawić `sending=false` ani zmienić statusu nowszej generacji.

## 7. Architektura serwera

`api/ai-chat.ts` zachowuje odpowiedzialność za autoryzację, rate limit, kontekst użytkownika i wywołanie Anthropic. Logika tłumaczenia Anthropic SSE na NDJSON powinna zostać wydzielona do małej, testowalnej jednostki po stronie `api/lib`.

Translator serwera:

- emituje ramkę `chunk` wyłącznie dla poprawnego `content_block_delta` typu `text_delta`;
- emituje `done` po `message_stop`, jeśli stream zakończył się prawidłowo;
- emituje `error` po zdarzeniu błędu Anthropic, nieoczekiwanym wyjątku czytnika albo EOF bez poprawnego terminala, o ile połączenie z klientem nadal jest otwarte;
- nie połyka niepoprawnych zdarzeń w sposób prowadzący do fałszywego sukcesu;
- nigdy nie emituje więcej niż jednego terminala;
- nie zapisuje do zamkniętej odpowiedzi.

Request do Anthropic używa osobnego `AbortController`. Zamknięcie połączenia przez klienta powoduje anulowanie upstream fetchu i czytnika. Normalne `done` zostaje oznaczone przed `res.end()`, aby zwykłe zamknięcie poprawnej odpowiedzi nie zostało błędnie potraktowane jako abort.

Oczekiwany abort po zamknięciu połączenia przez klienta nie próbuje emitować ramki `error`, ponieważ odbiorca już nie istnieje. Jest trzecim dozwolonym terminalem lifecycle obok `done` i `error`.

Jeżeli wyjątek trafi do głównego handlera po wysłaniu nagłówków albo zamknięciu odpowiedzi, handler nie może próbować wysłać drugiej odpowiedzi JSON.

## 8. Feedback i dostępność

Komunikat `failed` korzysta z dostępnego regionu błędu i ma przycisk o jednoznacznej nazwie `Ponów odpowiedź AI`. Komunikat `interrupted` korzysta z neutralnego regionu statusowego i nie jest ogłaszany jako awaria.

Reset zachowuje obecną, krótką nazwę i nie dodaje dialogu. Tryb Plan nie jest blokowany przez trwającą odpowiedź. Po powrocie do Rozmowy pytanie i stan przerwania są nadal widoczne.

Faza nie zmienia układu ekranu, stylu wiadomości, starter prompts ani design systemu.

## 9. Obserwowalność i bezpieczeństwo

Oczekiwane anulowania `reset`, `mode-change` i `unmount` nie są raportowane jako błędy produktu. Nieoczekiwany błąd streamu jest logowany po stronie serwera z rodzajem terminalnego błędu i statusem upstreamu, jeśli jest znany.

Logi nie mogą zawierać:

- klucza Claude API;
- promptu użytkownika;
- wiadomości z kontekstu;
- fragmentów wygenerowanej odpowiedzi.

Istniejąca diagnostyka E2E z `TEST-05` rejestruje `pageerror`, krytyczne błędy konsoli i `requestfailed`. Celowany test może sklasyfikować wyłącznie oczekiwany abort jako dozwolony. Inne awarie requestu pozostają błędem testu.

## 10. Strategia testów

### 10.1 Parser klienta

Testy jednostkowe obejmują:

- pojedynczą i wiele ramek w jednym chunku transportowym;
- jedną ramkę podzieloną między wiele chunków;
- `chunk → done`;
- `chunk → error`;
- EOF bez terminala;
- błędny JSON i niepoprawny kształt ramki;
- brak body;
- abort przez `AbortSignal`.

### 10.2 Lifecycle komponentu

Testy komponentowe z kontrolowanymi promise'ami obejmują:

- Reset podczas streamu i późny chunk lub resolve starej generacji;
- zmianę trybu podczas streamu i stan `interrupted` po powrocie;
- unmount podczas streamu;
- błąd po części tekstu;
- Ponów bez duplikatu wiadomości użytkownika;
- nowszą generację odporną na `catch` i `finally` starszej.

### 10.3 Translator serwera

Testy jednostkowe z kontrolowanym Anthropic SSE obejmują:

- poprawne delty i `message_stop`;
- błąd przed pierwszym tekstem;
- błąd po części tekstu;
- wyjątek czytnika;
- EOF bez `message_stop`;
- zerwanie połączenia przez klienta;
- dokładnie jeden terminal i brak zapisu po zamknięciu odpowiedzi.

### 10.4 Przeglądarka

Deterministyczny test przeglądarkowy używa mockowanego `ReadableStream` dla endpointu AI. Nie korzysta z prawdziwego Claude API ani prywatnego konta. Test i bezpośrednia obserwacja potwierdzają:

- Reset w trakcie streamu;
- zmianę trybu w trakcie streamu;
- odrzucenie części odpowiedzi po `error`;
- Ponów bez duplikatu pytania.

## 11. Granice zakresu

Faza 6A nie obejmuje:

- poprawności, dostępności i kosztu kontekstu AI z Fazy 6B;
- klasyfikacji klucza, modelu, limitu i upstreamu z Fazy 6C;
- walidacji wygenerowanego planu z Fazy 6C;
- trwałej historii rozmów ani dziennego budżetu AI;
- redesignu ekranu AI;
- przebudowy niestreamowanego generatora planów.

Wejście do trybu Plan ma jedynie anulować aktywny stream rozmowy. Lifecycle samego requestu generatora planów pozostaje poza tym pakietem.

## 12. Kryteria odbioru

Faza jest gotowa do zamknięcia, gdy:

1. Reset, zmiana trybu i unmount anulują aktywny stream oraz unieważniają starą generację.
2. Żaden spóźniony chunk, resolve, catch ani finally nie zmienia nowszego stanu.
3. Każdy stream kończy się `done`, `error` albo oczekiwanym abortem.
4. Częściowa odpowiedź po błędzie nie jest zapisana jako wiadomość asystenta.
5. Ponów zachowuje jedno pytanie użytkownika i tworzy nową generację.
6. Zerwanie klienta anuluje request do Anthropic.
7. Testy klienta, komponentu, serwera i celowany test przeglądarkowy przechodzą bez prawdziwego Claude API.
8. Pełne `npm run test:unit`, `npm run lint` i `npm run build` przechodzą.
9. Bezpośrednia obserwacja w przeglądarce potwierdza zatwierdzony kontrakt UX.
10. Roadmapa i pamięć projektu zostają zaktualizowane przy zamknięciu fazy.

Push, deploy i czynności produkcyjne nie należą do tej specyfikacji i wymagają osobnej autoryzacji.
