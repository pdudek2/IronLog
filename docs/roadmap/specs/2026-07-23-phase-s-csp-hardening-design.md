# Faza S — Hardening CSP

**Status:** DESIGN APPROVED

**Data:** 2026-07-23

**Właściciel zakresu:** `SECURITY-01`, `SECURITY-02`, `SECURITY-03` z `docs/roadmap/ROADMAP.md`

**Route:** Medium — zmiana koordynuje konfigurację Vercel, allowlistę zasobów oraz izolowany smoke przeglądarkowy

**Ryzyko:** Elevated — zbyt wąska polityka może zablokować logowanie, Firestore albo zasoby wymagane do renderowania aplikacji

## 1. Decyzja

IronLog przechodzi z pozornego `Content-Security-Policy-Report-Only` bez odbiorcy raportów na egzekwowany `Content-Security-Policy`. Nie budujemy endpointu raportującego ani nowej warstwy konfiguracji. Jedynym produkcyjnym źródłem prawdy pozostaje `vercel.json`.

## 2. Docelowa polityka

Polityka ma zawierać co najmniej:

- `default-src 'self'`;
- `script-src 'self'` bez `'unsafe-inline'`;
- `connect-src 'self' https://*.googleapis.com`;
- `img-src 'self' data:`;
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`;
- `font-src 'self' https://fonts.gstatic.com`;
- `frame-src 'self' https://*.firebaseapp.com`;
- `object-src 'none'`;
- `base-uri 'self'`;
- `form-action 'self'`;
- `frame-ancestors 'none'`.

`style-src` zachowuje `'unsafe-inline'`, ponieważ aktualny React UI intensywnie używa atrybutów `style`. Nie jest to w tej fazie pretekst do refaktoru stylowania. Originy `firebaseio.com`, szerokie `img-src https:` i wyjątek skryptowy mają zostać usunięte, chyba że kontrolowany smoke dostarczy konkretny dowód ich konieczności.

## 3. Powtarzalna weryfikacja

Jeden test `tests/e2e/csp.spec.ts` ma:

1. odczytać produkcyjny nagłówek z `vercel.json`;
2. potwierdzić tryb enforcement, wymagane dyrektywy, brak localhosta i brak originów usuniętej analityki;
3. wstrzyknąć tę politykę do odpowiedzi dokumentu podczas izolowanego Playwright;
4. tylko w lokalnym wariancie dopisać originy emulatorów Auth i Firestore oraz WebSocket HMR serwera Vite do `connect-src`;
5. przejść publiczną trasę logowania oraz chroniony dashboard;
6. odrzucić naruszenia CSP, zablokowane wymagane zasoby i nieoczekiwane zewnętrzne originy.

Lokalne wyjątki emulatorów i serwera developerskiego nie mogą trafić do `vercel.json`. Smoke nie zastępuje produkcyjnej obserwacji Network — ta pozostaje `RELEASE-09`.

## 4. Zakres i kompatybilność

Zmiana nie dotyka UI, danych, Firebase Rules, API ani kontraktów autoryzacji. Google Fonts pozostają dozwolone. Same-origin Vercel Functions pozostają objęte przez `'self'`.

Nie dodajemy zależności, endpointu raportów, nonce, generatora nagłówków ani osobnego modułu CSP. Test odczytuje istniejący JSON bez tworzenia drugiego źródła prawdy.

## 5. Rollout i recovery

Obecny zakres kończy się na lokalnej implementacji i weryfikacji. Push, preview deploy, produkcyjny deploy i produkcyjna obserwacja CSP wymagają osobnej zgody.

Przy późniejszym rolloutcie nagłówek jest publikowany atomowo z deploymentem Vercel. Recovery polega na przywróceniu poprzedniego deploymentu albo czasowym powrocie klucza nagłówka do `Content-Security-Policy-Report-Only`; nie wymaga migracji danych.

## 6. Kryteria wyjścia

- `vercel.json` emituje egzekwowany CSP i nie zawiera nieużywanych originów analitycznych;
- test kontraktu wykrywa powrót do Report-Only, rozszerzenie allowlisty albo brak wymaganych dyrektyw;
- izolowany smoke publicznej i chronionej trasy przechodzi bez naruszeń CSP;
- lint, pełne unity i build pozostają zielone;
- roadmapa zachowuje `RELEASE-09` jako osobną kontrolę produkcyjną.
