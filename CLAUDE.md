# IronLog — instrukcje dla Claude

## Projekt

Webowa aplikacja treningowa (wzorowana na Hevy). Projekt zaliczeniowy — 3-osobowy team, deadline koniec semestru. Priorytet: pragmatyzm i ukończenie end-to-end, nie over-engineering.

## Stack

- React 19, TypeScript, Vite, Zustand, Framer Motion
- Firebase Auth + Firestore (Web SDK po stronie klienta, Admin SDK w Vercel Functions)
- Vercel Serverless Functions (Node.js runtime — nie Edge, Admin SDK tego wymaga)
- Hosting: Vercel, auto-deploy z GitHub

## Design system

Dark glass. Tokeny CSS w `src/index.css`:

- Tło: `#08061A`, Surface: `rgba(34,31,67)`, Akcent: `#e8ff57`
- Utility classes: `.page-shell`, `.page-container`, `.surface-panel`, `.desktop-app-grid`, `.desktop-sticky`, `.eyebrow`, `.section-title`, `.stat-meta`, `.metric-card`
- Gradient na primary buttonach: `linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)` — świadomy wzorzec, nie bug
- Mobile-first; sidebar (`desktop-sticky`) ukryty przez `hidden lg:block`

## Architektura danych

Kolekcje Firestore (top-level z polem `userId`, nie subkolekcje):

- `activeSessions/{uid}` — aktywna sesja, owner CRUD przez klienta
- `workouts/{id}` — ukończone treningi; klient tworzy, update/delete tylko Admin SDK
- `exerciseSessions/{id}` — per ćwiczenie per trening; tylko serwer pisze (materializacja)
- `records/{id}` — PR per ćwiczenie; tylko serwer pisze; id = `${uid}_${source}_${exerciseId}`
- `userExercises/{id}` — własne ćwiczenia użytkownika, owner CRUD
- `templates/{id}` — szablony treningowe, owner CRUD
- `readiness/{id}` — ankieta gotowości, owner CRUD
- `chatMessages/{id}` — tylko serwer pisze, klient read
- `dailyAiUsage/{id}` — tylko Admin SDK, klient brak dostępu
- `exercises` (globalna) — seed data, read dla zalogowanego

**`exerciseSource: 'global' | 'user'`** przechodzi przez cały system — każda referencja do ćwiczenia musi mieć to pole.

Globalne ćwiczenia zostają w `src/data/exercises.ts` — nie migrujemy do Firestore.

## ESLint — pułapki w tym projekcie

**Nie ustawiaj stanu synchronicznie na początku `useEffect`** — reguła `react-hooks/set-state-in-effect` blokuje buildy:

```ts
// ŹLE
useEffect(() => {
  setLoading(true)  // ESLint error
  fetchData().finally(() => setLoading(false))
}, [dep])

// DOBRZE
const [loading, setLoading] = useState(true)
useEffect(() => {
  fetchData().finally(() => setLoading(false))
}, [dep])
```

**`FormEvent` deprecated w React 19** — używaj `React.FormEvent<HTMLFormElement>` zamiast named importu.

**Hook `posttooluse-validate`** sugeruje `'use client'` na plikach `.tsx` — fałszywy alarm, projekt to Vite SPA nie Next.js.

## Konwencje kodu

- Serwisy (`src/lib/`) zawierają całą logikę Firestore — nie wołaj `getDoc`/`setDoc` bezpośrednio w komponentach
- Lazy loading + `PrivateRoute` dla wszystkich chronionych stron w `src/router/index.tsx`
- `onSnapshot` tylko na aktywną sesję (`activeSessions`); reszta to jednorazowe `getDocs`
- Ciężary zawsze w kg w bazie; przeliczenie na lbs tylko w UI

## Przy audytach kodu

Rozróżniaj realne bugi produktowe od porządku w kodzie:

- **Wysokie priorytety**: race conditions, mylące stany UI (error vs empty state), złe klucze React
- **Niskie priorytety**: logika w złym miejscu gdy działa poprawnie, brak pre-checków klienta gdy Firestore rules to chronią

Zawsze weryfikuj znalezisko przed flagowaniem — sprawdź CSS (`grep` w `src/index.css`), sprawdź czy wzorzec jest świadomy patrząc na inne komponenty.
