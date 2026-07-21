# Phase 6A AI Stream and Concurrency Implementation Plan

**Status:** COMPLETED — VERIFIED — AWAITING INTEGRATION

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use `superpowers:test-driven-development` for every behavior change and `superpowers:verification-before-completion` before claiming a task or the phase complete.

**Goal:** Zapewnić, że odpowiedź AI jest zapisywana wyłącznie po jawnym `done`, a Reset, zmiana trybu i unmount anulują request oraz blokują wszystkie spóźnione aktualizacje.

**Architecture:** IronLog zastępuje surowy `text/plain` jawnym protokołem NDJSON `chunk | done | error`. Czysty parser klienta i translator Anthropic SSE są odizolowanymi, testowalnymi jednostkami; `ChatPage` pozostaje właścicielem identyfikatora generacji i `AbortController`, a serwer propaguje zamknięcie klienta do upstreamu.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Vitest 4, Testing Library, Playwright 1.59, Node.js `ReadableStream`, Vercel Node Functions, Anthropic Messages API, Firebase Auth/Admin SDK.

**Approved design:** `docs/roadmap/specs/2026-07-21-phase-6a-ai-stream-concurrency-design.md`

## Global Constraints

- Zakres obejmuje wyłącznie `AI-07` i `AI-08` z Fazy 6A.
- Warstwa IronLog używa `application/x-ndjson; charset=utf-8` i dokładnie trzech ramek: `{"type":"chunk","text":"..."}`, `{"type":"done"}` oraz `{"type":"error","message":"..."}`.
- Wiadomość asystenta trafia do `messages` dopiero po poprawnym `done`; częściowy tekst pozostaje wyłącznie podglądem.
- EOF bez terminala, błędna ramka i `error` po HTTP 200 są błędami, nigdy poprawną częściową odpowiedzią.
- Reset anuluje i czyści bez komunikatu. Zmiana trybu anuluje, zachowuje pytanie i pokazuje neutralne `Generowanie przerwane`. Unmount anuluje bez aktualizacji UI.
- `Ponów` używa tego samego pytania i kontekstu bez dodania drugiej wiadomości użytkownika.
- Statusy, identyfikatory i powody anulowania w kodzie pozostają po angielsku; copy widoczne dla użytkownika pozostaje po polsku.
- Oczekiwane aborty `reset`, `mode-change` i `unmount` nie są raportowane jako błędy produktu.
- Logi nie zawierają klucza Claude API, promptu, kontekstu ani fragmentów odpowiedzi.
- Szczegółowa klasyfikacja błędów klucza, modelu, limitu i upstreamu pozostaje w Fazie 6C.
- Nie zmieniać jakości ani budżetu kontekstu AI z Fazy 6B, generatora planów, Firestore, reguł, schematu danych ani designu ekranu.
- Nie dodawać zależności; używać natywnego `ReadableStream`, `TextDecoder`, `AbortController` i `fetch`.
- Nie ustawiać stanu synchronicznie na początku `useEffect`; nie dodawać `'use client'`, ponieważ aplikacja jest Vite SPA.
- Testy nie używają prawdziwego Claude API, prawdziwego klucza ani prywatnego live konta.
- Nie stage'ować ani nie commitować należącego do użytkownika pliku `docs/audits/2026-07-14-senior-design-review.md`.
- Nie wykonywać pushu, deployu ani czynności `RELEASE-08` bez osobnej zgody.
- Commity nie mogą zawierać `Co-Authored-By` ani innych trailerów AI.

## File Structure

### New files

- `src/lib/chatStreamProtocol.ts` — czysty dekoder NDJSON, typy ramek oraz rozróżnienie błędu zdalnego, protokołu i abortu.
- `src/lib/__tests__/chatStreamProtocol.test.ts` — podział ramek między chunki, terminale, błędny protokół i abort.
- `src/lib/__tests__/chatService.test.ts` — kontrakt `fetch`, `AbortSignal`, błędy HTTP i delegacja do parsera.
- `src/pages/__tests__/ChatPageStreamLifecycle.test.tsx` — reset, zmiana trybu, unmount, retry i ochrona przed starą generacją.
- `api/lib/aiChatStream.ts` — ramki NDJSON, translator Anthropic SSE i most zamknięcia klienta do `AbortSignal` upstreamu.
- `api/lib/__tests__/aiChatStream.test.ts` — sukces, częściowy błąd, niepoprawny EOF, pojedynczy terminal i disconnect.
- `tests/e2e/support/mockAiStream.ts` — deterministyczny mock modeli oraz streamu AI wykonywany w kontekście przeglądarki.

### Modified files

- `src/lib/chatService.ts`
- `src/pages/ChatPage.tsx`
- `src/index.css`
- `api/ai-chat.ts`
- `tests/e2e/chat.spec.ts`
- `docs/roadmap/ROADMAP.md` — wyłącznie przy rzeczywistym zamknięciu fazy.
- `docs/roadmap/specs/2026-07-21-phase-6a-ai-stream-concurrency-design.md` — status końcowy po weryfikacji.
- `docs/roadmap/plans/2026-07-21-phase-6a-ai-stream-concurrency.md` — checkboxy i status wykonania.
- `WORKING_CONTEXT.md` — aktualizacja przez `memory-save` po zamknięciu; plik pozostaje poza commitem, jeśli nadal jest ignorowany.

---

## Task 0: Establish an isolated, reproducible baseline

**Files:**
- Read: `docs/roadmap/specs/2026-07-21-phase-6a-ai-stream-concurrency-design.md`
- Read: `docs/roadmap/ROADMAP.md:351`
- Verify only: current checkout and worktree

**Interfaces:**
- Consumes: zatwierdzony kontrakt `AI-07`, `AI-08`.
- Produces: czysty worktree na branchu `phase-6a-ai-stream-concurrency` oraz zapisany baseline jakości.

- [x] **Step 1: Confirm the integration branch and preserve user-owned files**

Run:

```bash
git branch --show-current
git status --short
git log -3 --oneline
```

Expected: integration branch `puls-rebrand`; `docs/audits/2026-07-14-senior-design-review.md` może być untracked i pozostaje nietknięty.

- [x] **Step 2: Create an isolated implementation worktree**

Invoke `superpowers:using-git-worktrees`, then create a plain branch:

```bash
git worktree add .worktrees/phase-6a-ai-stream-concurrency -b phase-6a-ai-stream-concurrency
```

Expected: worktree points at the accepted plan commit; no `codex/` prefix.

- [x] **Step 3: Run the pre-change gates inside the worktree**

```bash
npm run test:unit
npm run lint
npm run build
```

Expected: at least 364 existing unit tests pass, lint exits 0, build exits 0. Record any pre-existing failure before changing code.

No commit in this task.

---

## Task 1: Add the strict client NDJSON protocol reader

**Files:**
- Create: `src/lib/chatStreamProtocol.ts`
- Create: `src/lib/__tests__/chatStreamProtocol.test.ts`

**Interfaces:**
- Consumes: browser-native `ReadableStream<Uint8Array>`, `AbortSignal`, `TextDecoder`.
- Produces:

```ts
export type ChatStreamFrame =
  | { type: 'chunk'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface ReadChatStreamOptions {
  signal: AbortSignal
  onChunk: (chunk: string) => void
}

export class ChatStreamProtocolError extends Error {}
export class ChatStreamRemoteError extends Error {}

export function isAbortError(error: unknown): boolean
export function readChatStream(
  body: ReadableStream<Uint8Array>,
  options: ReadChatStreamOptions,
): Promise<string>
```

- [x] **Step 1: Write the failing parser tests**

Create helpers that encode controlled transport chunks:

```ts
const encoder = new TextEncoder()

function streamFrom(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  })
}
```

Cover exactly:

```ts
it('reassembles NDJSON frames split across transport chunks', async () => {
  const onChunk = vi.fn()
  const controller = new AbortController()
  const body = streamFrom(
    '{"type":"chunk","te',
    'xt":"Cześć"}\n{"type":"chunk","text":"!"}\n',
    '{"type":"done"}\n',
  )

  await expect(readChatStream(body, { signal: controller.signal, onChunk }))
    .resolves.toBe('Cześć!')
  expect(onChunk).toHaveBeenNthCalledWith(1, 'Cześć')
  expect(onChunk).toHaveBeenNthCalledWith(2, '!')
})

it('rejects an error terminal after exposing temporary chunks', async () => {
  const onChunk = vi.fn()
  const body = streamFrom(
    '{"type":"chunk","text":"Część"}\n',
    '{"type":"error","message":"Stream przerwany."}\n',
  )

  await expect(readChatStream(body, {
    signal: new AbortController().signal,
    onChunk,
  })).rejects.toMatchObject({ name: 'ChatStreamRemoteError', message: 'Stream przerwany.' })
  expect(onChunk).toHaveBeenCalledWith('Część')
})
```

Add separate tests for EOF without terminal, malformed JSON, unknown frame, empty `done`, data after terminal and an already-aborted signal. Assert `isAbortError` only recognizes errors with name `AbortError`.

- [x] **Step 2: Run the focused test and confirm RED**

```bash
npm run test:unit -- src/lib/__tests__/chatStreamProtocol.test.ts
```

Expected: FAIL because `chatStreamProtocol.ts` does not exist.

- [x] **Step 3: Implement strict line buffering and terminal validation**

Implement the frame parser as a private function and keep all public types in this file:

```ts
function parseFrame(line: string): ChatStreamFrame {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    throw new ChatStreamProtocolError('Stream AI zwrócił niepoprawne dane.')
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChatStreamProtocolError('Stream AI zwrócił niepoprawną ramkę.')
  }

  const frame = value as Record<string, unknown>
  if (frame.type === 'chunk' && typeof frame.text === 'string') {
    return { type: 'chunk', text: frame.text }
  }
  if (frame.type === 'done') return { type: 'done' }
  if (frame.type === 'error' && typeof frame.message === 'string' && frame.message.trim()) {
    return { type: 'error', message: frame.message.trim() }
  }
  throw new ChatStreamProtocolError('Stream AI zwrócił nieznany typ ramki.')
}
```

`readChatStream` must:

1. acquire one reader;
2. buffer until `\n` without assuming transport chunk boundaries;
3. append and announce only `chunk` frames;
4. throw `ChatStreamRemoteError` on `error`;
5. require exactly one `done`, non-empty accumulated text and no non-whitespace data after the terminal;
6. throw `ChatStreamProtocolError('Stream AI zakończył się bez potwierdzenia.')` on EOF without terminal;
7. cancel the reader on abort and rethrow an error named `AbortError`;
8. remove the abort listener and release the reader lock in `finally`.

Do not accept a terminal frame that is not newline-delimited; every frame in the approved wire contract ends with `\n`.

- [x] **Step 4: Run focused tests and static checks**

```bash
npm run test:unit -- src/lib/__tests__/chatStreamProtocol.test.ts
npm run lint -- --quiet
```

Expected: parser tests PASS; lint exits 0.

- [x] **Step 5: Commit the client protocol unit**

```bash
git add src/lib/chatStreamProtocol.ts src/lib/__tests__/chatStreamProtocol.test.ts
git commit -m "feat: add AI stream protocol parser"
```

---

## Task 2: Require an explicit terminal in the chat transport service

**Files:**
- Create: `src/lib/__tests__/chatService.test.ts`
- Modify: `src/lib/chatService.ts`

**Interfaces:**
- Consumes: `readChatStream(body, { signal, onChunk })` and `isAbortError` from Task 1.
- Produces:

```ts
interface StreamChatReplyOptions {
  apiKey: string
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>
  signal: AbortSignal
  onChunk: (chunk: string) => void
}

export function streamChatReply(options: StreamChatReplyOptions): Promise<string>
```

- [x] **Step 1: Write failing service tests**

Mock Firebase Auth before importing the service:

```ts
const { auth } = vi.hoisted(() => ({
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('id-token') } },
}))

vi.mock('../firebase', () => ({ auth, db: {} }))
vi.mock('../aiKeyStorage', () => ({ getClaudeModel: () => 'claude-test' }))
```

Create an NDJSON `Response` and assert the exact signal is passed to fetch:

```ts
const controller = new AbortController()
const body = new ReadableStream({
  start(streamController) {
    streamController.enqueue(new TextEncoder().encode(
      '{"type":"chunk","text":"Gotowe"}\n{"type":"done"}\n',
    ))
    streamController.close()
  },
})
const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
  status: 200,
  headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
}))
vi.stubGlobal('fetch', fetchMock)

await expect(streamChatReply({
  apiKey: 'sk-ant-test-key-longer-than-twenty-characters',
  messages: [{ role: 'user', content: 'Pomóż' }],
  signal: controller.signal,
  onChunk: vi.fn(),
})).resolves.toBe('Gotowe')

expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/ai-chat'),
  expect.objectContaining({ signal: controller.signal }))
```

Add tests preserving existing JSON HTTP errors, rejecting an empty body, rejecting a successful non-NDJSON response, and propagating `AbortError` without replacing it with the local-backend help message.

- [x] **Step 2: Run the focused test and confirm RED**

```bash
npm run test:unit -- src/lib/__tests__/chatService.test.ts
```

Expected: FAIL because `streamChatReply` does not accept or forward `signal` and still parses raw text.

- [x] **Step 3: Integrate the protocol reader**

Modify the request and success path:

```ts
response = await fetch(chatApiUrl, {
  method: 'POST',
  signal,
  headers: {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    apiKey,
    model: getClaudeModel() || undefined,
    messages,
  }),
})
```

After existing `response.ok` handling, require `response.body` and an NDJSON content type, then return:

```ts
return readChatStream(response.body, { signal, onChunk })
```

In the fetch catch, rethrow when `isAbortError(error)` is true. Only genuine connection failures receive the existing localhost instruction.

- [x] **Step 4: Run client protocol and service tests**

```bash
npm run test:unit -- src/lib/__tests__/chatStreamProtocol.test.ts src/lib/__tests__/chatService.test.ts
npm run lint -- --quiet
```

Expected: both files PASS; lint exits 0.

- [x] **Step 5: Commit the transport integration**

```bash
git add src/lib/chatService.ts src/lib/__tests__/chatService.test.ts
git commit -m "feat: require terminal AI stream frames"
```

---

## Task 3: Own and invalidate chat generations in `ChatPage`

**Files:**
- Create: `src/pages/__tests__/ChatPageStreamLifecycle.test.tsx`
- Modify: `src/pages/ChatPage.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `streamChatReply({ apiKey, messages, signal, onChunk })` from Task 2.
- Produces these local contracts in `ChatPage.tsx`:

```ts
type ChatGenerationState =
  | { status: 'idle' }
  | { status: 'streaming'; questionId: string }
  | { status: 'interrupted'; questionId: string }
  | { status: 'failed'; questionId: string; message: string }

type ChatCancelReason = 'reset' | 'mode-change' | 'unmount' | 'superseded'

interface ActiveChatGeneration {
  generationId: string
  questionId: string
  controller: AbortController
  cancelReason: ChatCancelReason | null
}
```

- [x] **Step 1: Build a controlled stream mock and write RED lifecycle tests**

Reuse the existing auth, key, router, toast and Framer Motion mocks from `ChatPageAccessibility.test.tsx`. Capture every service call:

```ts
interface PendingReply {
  options: Parameters<typeof streamChatReply>[0]
  resolve: (value: string) => void
  reject: (error: unknown) => void
}

function deferredReply(options: PendingReply['options']): Promise<string> {
  return new Promise((resolve, reject) => {
    pendingReplies.push({ options, resolve, reject })
  })
}
```

Cover exactly:

```ts
it('aborts and invalidates a generation when Reset is pressed', async () => {
  render(<ChatPage />)
  sendPrompt('Czy progresuję?')
  const first = pendingReplies[0]

  fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
  expect(first.options.signal.aborted).toBe(true)

  first.options.onChunk('Spóźniony tekst')
  first.resolve('Spóźniona odpowiedź')
  await waitFor(() => expect(screen.queryByText('Spóźniona odpowiedź')).not.toBeInTheDocument())
  expect(screen.queryByText('Czy progresuję?')).not.toBeInTheDocument()
})

it('keeps one question and exposes retry after a mode-change abort', async () => {
  render(<ChatPage />)
  sendPrompt('Czy progresuję?')
  const first = pendingReplies[0]

  fireEvent.click(screen.getByRole('button', { name: /^Plan/ }))
  expect(first.options.signal.aborted).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: /Rozmowa/ }))

  expect(screen.getByRole('status')).toHaveTextContent('Generowanie przerwane')
  fireEvent.click(screen.getByRole('button', { name: 'Ponów odpowiedź AI' }))
  expect(screen.getAllByText('Czy progresuję?')).toHaveLength(1)
  expect(mocks.streamChatReply).toHaveBeenCalledTimes(2)
})
```

Add separate tests for unmount abort, partial chunk followed by rejection, retry success, and stale rejection/finally from generation A while generation B is still streaming. In the last case assert the composer remains disabled until B resolves.

- [x] **Step 2: Run the component test and confirm RED**

```bash
npm run test:unit -- src/pages/__tests__/ChatPageStreamLifecycle.test.tsx
```

Expected: FAIL because no signal, generation identity, interruption state or retry action exists.

- [x] **Step 3: Replace `sending` with the generation state machine**

Add:

```ts
const [generationState, setGenerationState] = useState<ChatGenerationState>({ status: 'idle' })
const activeGenerationRef = useRef<ActiveChatGeneration | null>(null)
const sending = generationState.status === 'streaming'
```

Create `cancelActiveGeneration(reason, updateUi = true)` that first removes the active ref, records the reason, aborts the controller and clears `streamText`. It sets `interrupted` only for `mode-change`; Reset sets `idle`. Unmount calls the same low-level abort path without state setters.

Add an effect whose cleanup performs only:

```ts
const active = activeGenerationRef.current
activeGenerationRef.current = null
if (active) {
  active.cancelReason = 'unmount'
  active.controller.abort('unmount')
}
```

- [x] **Step 4: Implement a generation-guarded request runner**

Extract a local `runChatGeneration(requestMessages, questionId)` that:

1. creates a new `generationId` and controller;
2. stores them in `activeGenerationRef`;
3. sets `streaming` and clears old feedback;
4. appends chunks only when the active id matches;
5. commits the assistant message only after the service resolves and the id still matches;
6. maps non-abort rejection to `failed` and clears the partial text;
7. clears the active ref in `finally` only when the same id is still active.

The identity guard must use this shape at every async boundary:

```ts
if (activeGenerationRef.current?.generationId !== generationId) return
```

`handleSend` adds the new user message once and passes the resulting array into the runner. `handleRetry` passes the existing `messages` array and stored `questionId`, without adding a user message.

- [x] **Step 5: Wire Reset, mode switching and accessible feedback**

Replace direct `setActiveTab` calls with `handleModeChange(nextTab)`. When leaving `chat` during `streaming`, call `cancelActiveGeneration('mode-change')` before setting the tab.

Reset calls `cancelActiveGeneration('reset')`, then clears messages, stream and general chat error.

Render feedback after the message list:

```tsx
{generationState.status === 'interrupted' && (
  <div className="coach-generation-feedback" role="status" aria-live="polite">
    <span>Generowanie przerwane.</span>
    <Button type="button" variant="ghost" onClick={handleRetry}>
      Ponów odpowiedź AI
    </Button>
  </div>
)}

{generationState.status === 'failed' && (
  <div className="coach-generation-feedback coach-generation-feedback--error" role="alert">
    <span>{generationState.message}</span>
    <Button type="button" variant="ghost" onClick={handleRetry}>
      Ponów odpowiedź AI
    </Button>
  </div>
)}
```

Add scoped CSS using existing surface, border, muted and danger tokens. Do not alter the page layout or message styling.

- [x] **Step 6: Run lifecycle and accessibility regressions**

```bash
npm run test:unit -- src/pages/__tests__/ChatPageStreamLifecycle.test.tsx src/pages/__tests__/ChatPageAccessibility.test.tsx
npm run lint -- --quiet
```

Expected: lifecycle and existing accessibility tests PASS; lint exits 0.

- [x] **Step 7: Commit the component lifecycle**

```bash
git add src/pages/ChatPage.tsx src/pages/__tests__/ChatPageStreamLifecycle.test.tsx src/index.css
git commit -m "fix: cancel stale AI chat generations"
```

---

## Task 4: Translate Anthropic SSE into one terminal NDJSON stream

**Files:**
- Create: `api/lib/aiChatStream.ts`
- Create: `api/lib/__tests__/aiChatStream.test.ts`

**Interfaces:**
- Consumes: Anthropic `ReadableStream<Uint8Array>` containing SSE data blocks.
- Produces:

```ts
export type ServerChatStreamFrame =
  | { type: 'chunk'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export type ChatStreamFailureReason =
  | 'upstream-error'
  | 'invalid-event'
  | 'reader-error'
  | 'unexpected-eof'
  | 'empty-response'

export type AnthropicStreamResult =
  | { status: 'done' }
  | { status: 'error'; reason: ChatStreamFailureReason }
  | { status: 'aborted' }

export interface PipeAnthropicStreamOptions {
  body: ReadableStream<Uint8Array>
  signal: AbortSignal
  isClientOpen: () => boolean
  writeFrame: (frame: ServerChatStreamFrame) => void
}

export function encodeChatStreamFrame(frame: ServerChatStreamFrame): string
export function pipeAnthropicStream(options: PipeAnthropicStreamOptions): Promise<AnthropicStreamResult>
```

The same file also produces:

```ts
export interface ClientAbortBridge {
  signal: AbortSignal
  markTerminal: () => void
  dispose: () => void
}

export function createClientAbortBridge(
  req: IncomingMessage,
  res: ServerResponse,
): ClientAbortBridge
```

- [x] **Step 1: Write failing translator tests**

Use an encoder helper that wraps Anthropic events as `data: <json>\n\n`. Cover:

```ts
it('emits chunks and exactly one done after message_stop', async () => {
  const frames: ServerChatStreamFrame[] = []
  const result = await pipeAnthropicStream({
    body: anthropicStream(
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Plan' } },
      { type: 'message_stop' },
    ),
    signal: new AbortController().signal,
    isClientOpen: () => true,
    writeFrame: (frame) => frames.push(frame),
  })

  expect(result).toEqual({ status: 'done' })
  expect(frames).toEqual([
    { type: 'chunk', text: 'Plan' },
    { type: 'done' },
  ])
})

it('turns an upstream error after content into an error terminal', async () => {
  const frames: ServerChatStreamFrame[] = []
  const result = await pipeAnthropicStream({
    body: anthropicStream(
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Część' } },
      { type: 'error', error: { message: 'connection lost' } },
    ),
    signal: new AbortController().signal,
    isClientOpen: () => true,
    writeFrame: (frame) => frames.push(frame),
  })

  expect(result).toEqual({ status: 'error', reason: 'upstream-error' })
  expect(frames.at(-1)).toEqual({
    type: 'error',
    message: 'Nie udało się dokończyć odpowiedzi.',
  })
  expect(frames.some((frame) => frame.type === 'done')).toBe(false)
})
```

Add tests for malformed Anthropic JSON, reader exception, EOF without `message_stop`, `message_stop` without text, unknown nonterminal events, an aborted signal, and closed client. Assert `encodeChatStreamFrame({ type: 'done' }) === '{"type":"done"}\n'`.

For `createClientAbortBridge`, use `EventEmitter`-backed request and response doubles. Assert `req.emit('aborted')` and premature `res.emit('close')` abort the signal, while `markTerminal()` before `close` does not.

- [x] **Step 2: Run the focused server test and confirm RED**

```bash
npm run test:unit -- api/lib/__tests__/aiChatStream.test.ts
```

Expected: FAIL because `api/lib/aiChatStream.ts` does not exist.

- [x] **Step 3: Implement the SSE event buffer and single-terminal writer**

`encodeChatStreamFrame` is exactly:

```ts
export function encodeChatStreamFrame(frame: ServerChatStreamFrame): string {
  return `${JSON.stringify(frame)}\n`
}
```

`pipeAnthropicStream` must maintain `buffer`, `hasContent` and `terminalSent`. It ignores known nonterminal Anthropic events, writes text deltas, maps `message_stop` with content to `done`, and maps upstream `error`, malformed data or invalid EOF to one generic Polish `error` frame. Attach a one-shot abort listener that cancels the upstream reader, then remove the listener and release the reader lock in `finally`, so a pending `reader.read()` cannot survive client disconnect.

Before every write, check `isClientOpen()`. If the signal is aborted or the client is closed, return `{ status: 'aborted' }` without trying to write `error`. Błędy zwracają stabilny, nietreściowy `reason`, aby handler mógł zapisać minimalną diagnostykę. Nie umieszczaj komunikatu upstreamu w ramce klienta ani logach tego helpera.

- [x] **Step 4: Implement the client disconnect bridge**

Use one `AbortController`, attach `req.once('aborted', onDisconnect)` and `res.once('close', onDisconnect)`, and guard normal completion:

```ts
let terminal = false
const onDisconnect = () => {
  if (!terminal) controller.abort('client-disconnected')
}

return {
  signal: controller.signal,
  markTerminal: () => { terminal = true },
  dispose: () => {
    req.off('aborted', onDisconnect)
    res.off('close', onDisconnect)
  },
}
```

- [x] **Step 5: Run focused server tests and lint**

```bash
npm run test:unit -- api/lib/__tests__/aiChatStream.test.ts
npm run lint -- --quiet
```

Expected: translator and bridge tests PASS; lint exits 0.

- [x] **Step 6: Commit the server protocol unit**

```bash
git add api/lib/aiChatStream.ts api/lib/__tests__/aiChatStream.test.ts
git commit -m "feat: translate Anthropic stream events"
```

---

## Task 5: Integrate NDJSON and disconnect cancellation in the API handler

**Files:**
- Modify: `api/ai-chat.ts`
- Modify: `api/lib/__tests__/aiChatStream.test.ts`

**Interfaces:**
- Consumes: `createClientAbortBridge`, `encodeChatStreamFrame`, `pipeAnthropicStream` from Task 4.
- Produces: `/api/ai-chat` chat mode with explicit NDJSON terminal and upstream cancellation; plan mode remains unchanged JSON.
- Produces:

```ts
export function writeChatStreamFrame(
  res: ServerResponse,
  frame: ServerChatStreamFrame,
): boolean
```

- [x] **Step 1: Add a RED integration-shaped writer test**

Extend `aiChatStream.test.ts` with a `ServerResponse` double. Export `writeChatStreamFrame(res, frame): boolean` from `api/lib/aiChatStream.ts` and assert it does not write after `writableEnded` or `destroyed`:

```ts
expect(writeChatStreamFrame(openResponse, { type: 'done' })).toBe(true)
expect(written).toBe('{"type":"done"}\n')

closedResponse.writableEnded = true
expect(writeChatStreamFrame(closedResponse, { type: 'error', message: 'x' })).toBe(false)
expect(writtenAfterClose).toBe('')
```

- [x] **Step 2: Run the focused test and confirm RED**

```bash
npm run test:unit -- api/lib/__tests__/aiChatStream.test.ts
```

Expected: FAIL until the guarded writer contract exists.

- [x] **Step 3: Replace raw text streaming in `api/ai-chat.ts`**

In chat mode:

1. create the client abort bridge before the Anthropic fetch;
2. pass `bridge.signal` into the upstream `fetch`;
3. preserve existing non-2xx handling before response headers are sent;
4. set `application/x-ndjson; charset=utf-8` and `Cache-Control: no-store`;
5. call `pipeAnthropicStream` with a guarded response writer;
6. call `bridge.markTerminal()` for both `done` and `error` results before `res.end()`;
7. for `{ status: 'error' }`, log only `[ai-chat stream terminal]` with `reason` and `model`, never the key, prompt, context or generated text;
8. return silently for `{ status: 'aborted' }`;
9. always call `bridge.dispose()` in `finally`.

The upstream request must include:

```ts
signal: bridge.signal,
```

If the upstream fetch itself rejects after the client disconnects but before a body exists, detect `bridge.signal.aborted` and return silently. Do not convert an expected disconnect into a JSON error or `console.error`.

Remove the old `hasContent` fallback that wrote `Claude API nie zwróciło treści odpowiedzi.` as if it were assistant content.

- [x] **Step 4: Prevent a second JSON response after streaming starts**

At the handler catch boundary, return without `sendApiError` when the response can no longer accept a fresh HTTP response:

```ts
if (res.headersSent || res.writableEnded || res.destroyed) return
```

Pre-stream authentication, rate-limit, body and upstream HTTP failures keep their current JSON response shapes and status codes.

- [x] **Step 5: Run server, client protocol and build checks**

```bash
npm run test:unit -- api/lib/__tests__/aiChatStream.test.ts src/lib/__tests__/chatStreamProtocol.test.ts src/lib/__tests__/chatService.test.ts
npm run lint
npm run build
```

Expected: focused tests PASS; lint and build exit 0.

- [x] **Step 6: Commit the API integration**

```bash
git add api/ai-chat.ts api/lib/aiChatStream.ts api/lib/__tests__/aiChatStream.test.ts
git commit -m "fix: propagate AI stream cancellation"
```

---

## Task 6: Add deterministic browser coverage for the approved UX

**Files:**
- Create: `tests/e2e/support/mockAiStream.ts`
- Modify: `tests/e2e/chat.spec.ts`

**Interfaces:**
- Consumes: the browser route `/chat`, localStorage keys `ironlog.claudeApiKey` and `ironlog.claudeModel`, and the NDJSON frame contract.
- Produces:

```ts
export type MockAiFrame =
  | { delayMs: number; frame: { type: 'chunk'; text: string } }
  | { delayMs: number; frame: { type: 'done' } }
  | { delayMs: number; frame: { type: 'error'; message: string } }

export interface MockAiAttempt {
  frames: MockAiFrame[]
  holdOpen?: boolean
}

export function installMockAiRuntime(page: Page, attempts: MockAiAttempt[]): Promise<void>
```

- [x] **Step 1: Implement the browser-local mock runtime**

Use `page.addInitScript` before navigation. The script must:

- seed a test-only key and model in localStorage;
- preserve the original `window.fetch` for every unrelated URL;
- return `{ models: [{ id: 'claude-test', label: 'Claude Test' }] }` for `/api/ai-models`;
- return a controlled `ReadableStream` and NDJSON content type for `/api/ai-chat`;
- observe `init.signal`, clear pending timers and error the stream with `AbortError` after cancellation;
- expose only a boolean abort counter for assertions, never the fake key or prompt.

The chat response constructor uses:

```ts
return new Response(stream, {
  status: 200,
  headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
})
```

- [x] **Step 2: Write the deterministic browser tests**

Replace the obsolete blocker comment in `chat.spec.ts`. Add tests for:

1. partial `chunk`, then `error`: the partial text disappears, the user question remains, `role="alert"` and `Ponów odpowiedź AI` appear;
2. mode switch during a held-open stream: the mock records abort, returning to chat shows `Generowanie przerwane`, and retry produces one question plus one completed answer;
3. Reset during a held-open stream: the mock records abort and neither the question nor any late assistant text remains.

Use accessible locators and assert the user question count:

```ts
await expect(page.getByText('Czy progresuję?', { exact: true })).toHaveCount(1)
await page.getByRole('button', { name: 'Ponów odpowiedź AI' }).click()
await expect(page.getByText('Pełna odpowiedź', { exact: true })).toBeVisible()
await expect(page.getByText('Czy progresuję?', { exact: true })).toHaveCount(1)
```

Wrap intentional request aborts with the existing `expectedBrowserDiagnostics.during(...)` fixture only when the diagnostics layer actually records them. Do not broadly suppress all `requestfailed` entries.

- [x] **Step 3: Run the isolated chat E2E gate**

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e \
firebase emulators:exec --only auth,firestore --project demo-ironlog \
"npx playwright test tests/e2e/chat.spec.ts --project=desktop --retries=0"
```

Expected: all chat tests PASS without any Anthropic request, unexpected browser diagnostic or live Firebase quota.

- [x] **Step 4: Perform direct browser observation**

Use Playwright or computer use against the same deterministic mock. Observe and record:

- partial text appears only during `streaming` and disappears after `error`;
- the failure action is visible and focusable;
- changing to Plan does not hang and returning shows the neutral interrupted state;
- retry keeps one user bubble;
- Reset returns the conversation to its empty state.

Capture one desktop screenshot for the failed state and one for the interrupted state under `test-results/`; these are diagnostic evidence, not pixel baselines and are not committed.

- [x] **Step 5: Commit browser coverage**

```bash
git add tests/e2e/chat.spec.ts tests/e2e/support/mockAiStream.ts
git commit -m "test: cover AI stream lifecycle in browser"
```

---

## Task 7: Run the phase gate, review the branch, and close canonical docs

**Files:**
- Modify after successful verification: `docs/roadmap/ROADMAP.md`
- Modify after successful verification: `docs/roadmap/specs/2026-07-21-phase-6a-ai-stream-concurrency-design.md`
- Modify: `docs/roadmap/plans/2026-07-21-phase-6a-ai-stream-concurrency.md`
- Update through skill: `WORKING_CONTEXT.md`

**Interfaces:**
- Consumes: all completed Tasks 1–6 and direct browser evidence.
- Produces: reviewed Phase 6A branch, truthful canonical status and integration-ready handoff. It does not merge, push or deploy.

- [x] **Step 1: Run all focused Phase 6A tests together**

```bash
npm run test:unit -- \
  src/lib/__tests__/chatStreamProtocol.test.ts \
  src/lib/__tests__/chatService.test.ts \
  src/pages/__tests__/ChatPageStreamLifecycle.test.tsx \
  src/pages/__tests__/ChatPageAccessibility.test.tsx \
  api/lib/__tests__/aiChatStream.test.ts
```

Expected: every focused file PASS.

- [x] **Step 2: Run the full repository quality gate**

```bash
npm run test:unit
npm run lint
npm run build
```

Expected: full unit suite, lint and build PASS. The existing Vite chunk-size warning may remain informational; no new warning is silently accepted.

- [x] **Step 3: Re-run the deterministic browser gate**

```bash
E2E_BACKEND=emulator TEST_EMAIL=e2e@ironlog.local TEST_PASSWORD=ironlog-e2e \
firebase emulators:exec --only auth,firestore --project demo-ironlog \
"npx playwright test tests/e2e/chat.spec.ts --project=desktop --retries=0"
```

Expected: PASS with only explicitly scoped intentional abort diagnostics, if any.

- [x] **Step 4: Request two-stage review before closure**

Use `superpowers:requesting-code-review` and review the complete diff against the approved spec. Require:

1. spec-compliance review: all `AI-07` and `AI-08` criteria, abort reasons, terminal rules and exclusions;
2. code-quality review: races, write-after-close, reader cleanup, accessibility, test determinism and secret-safe logging.

Fix every confirmed P0/P1 issue and rerun the affected focused tests plus lint. Do not expand into Fazy 6B or 6C.

- [x] **Step 5: Run project convergence without integrating**

Invoke `project-convergence` on the reviewed branch. Required evidence:

- focused and full verification results;
- direct browser observations and diagnostic screenshot paths;
- `git diff --check`;
- no secrets, prompts or response chunks in logs;
- only expected files in `git status`;
- branch is ready for an explicit merge decision.

- [x] **Step 6: Update canonical docs only after every gate passes**

Change the Phase 6A row and section in `docs/roadmap/ROADMAP.md` from `READY` to `DONE`. Update the spec status to `zaimplementowany i zweryfikowany — oczekuje na integrację` and this plan status to `COMPLETED — VERIFIED — AWAITING INTEGRATION`.

Check all completed task boxes truthfully. Do not mark integration complete before the merge actually happens.

- [x] **Step 7: Commit the phase closeout**

```bash
git add \
  docs/roadmap/ROADMAP.md \
  docs/roadmap/specs/2026-07-21-phase-6a-ai-stream-concurrency-design.md \
  docs/roadmap/plans/2026-07-21-phase-6a-ai-stream-concurrency.md
git commit -m "docs: close phase 6a AI stream integrity"
```

- [x] **Step 8: Save project memory and hand back the merge decision**

Invoke `memory-save` with:

- Phase 6A implementation and verification status;
- branch and HEAD;
- exact unit, lint, build and E2E results;
- direct browser evidence;
- next dependent phase from the canonical roadmap;
- explicit note that push, deploy and integration were not performed.

Return to Patryk with the local merge choice. Do not merge, delete the worktree, push or deploy without the next explicit instruction.

---

## Implementation Completion Checklist

- [x] NDJSON client parser rejects malformed, missing and error terminals.
- [x] `streamChatReply` forwards `AbortSignal` and requires NDJSON.
- [x] Reset, mode change and unmount abort the active request.
- [x] Generation identity blocks every stale chunk, resolve, catch and finally.
- [x] Partial assistant text is never committed after failure.
- [x] Retry preserves exactly one user question.
- [x] Server emits exactly one `done` or `error`, or finishes as expected abort.
- [x] Client disconnect aborts the Anthropic request and prevents write-after-close.
- [x] Expected aborts are not logged as product errors; sensitive values never enter logs.
- [x] Deterministic component, server and browser tests pass without real Claude API.
- [x] Full unit, lint and build gates pass.
- [x] Direct browser observation matches the approved UX.
- [x] Two-stage code review and convergence gate pass.
- [x] Roadmap, spec, plan and memory are updated truthfully.
- [x] No push, deploy, integration or user-owned audit mutation occurred without permission.
