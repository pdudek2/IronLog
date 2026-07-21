# Phase 6A final stream-cancellation fixes

## Scope

- Server: cancel the Anthropic reader after terminal stream failures, including upstream error events and malformed events.
- Client: cancel the response reader before propagating remote or protocol errors.
- Keep cancellation idempotent across overlapping failure and abort paths.
- Preserve terminal-frame, write-after-close, abort classification, listener cleanup and reader-lock behavior.

## Implementation

- `api/lib/aiChatStream.ts`
  - Reused one memoized cancellation promise for disconnect and failure cleanup.
  - Added a distinct `stream-failed` cancellation reason.
  - Cancelled after the single client-facing error terminal is written.
  - Cancelled on unexpected thrown failures before releasing the reader lock.
- `src/lib/chatStreamProtocol.ts`
  - Reused one memoized cancellation promise for abort and parser failures.
  - Cancelled before rethrowing remote and protocol errors.
  - Kept `AbortError` authoritative when an abort overlaps failure cleanup.
- Added regression assertions for exactly one underlying `cancel()` call on:
  - server `upstream-error`;
  - server `invalid-event`;
  - client remote `error` frame;
  - client malformed NDJSON.

## TDD evidence

RED command:

```text
npx vitest run api/lib/__tests__/aiChatStream.test.ts src/lib/__tests__/chatStreamProtocol.test.ts
```

Result before implementation: 4 failed, 38 passed. Every new assertion failed because `cancel()` had 0 calls instead of 1.

GREEN result after implementation: 2 files passed, 42 tests passed.

## Verification

- Focused parsers: 2 files, 42 tests passed.
- Phase 6A focused suite (protocol, service, lifecycle, accessibility, server translator and API integration): 6 files, 66 tests passed.
- Full unit suite: 57 files, 425 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed before final report creation; repeated before commit.

No UI, documentation, or E2E mock contract was changed.
