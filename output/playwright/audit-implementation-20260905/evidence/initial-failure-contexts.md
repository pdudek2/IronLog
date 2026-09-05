test-results/workout-guard-Workout-navi-fda03--away-preserves-the-session-mobile/error-context.md

# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workout-guard.spec.ts >> Workout navigation guard >> navigating away preserves the session
- Location: tests/e2e/workout-guard.spec.ts:97:3

# Error details

```
Error: discard active session: page.goto: Navigation to "http://localhost:5174/workout/new" is interrupted by another navigation to "http://localhost:5174/workout/new"
Call log:
  - navigating to "http://localhost:5174/workout/new", waiting until "load"


expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 6

- Array []
+ Array [
+   "discard active session: page.goto: Navigation to \"http://localhost:5174/workout/new\" is interrupted by another navigation to \"http://localhost:5174/workout/new\"
+ Call log:
+   - navigating to \"http://localhost:5174/workout/new\", waiting until \"load\"
+ ",
+ ]
```



test-results/protected-shell-Protected--e7e98--route-inside-the-app-shell-desktop/error-context.md

# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: protected-shell.spec.ts >> Protected application shell >> keeps an authenticated unknown route inside the app shell
- Location: tests/e2e/protected-shell.spec.ts:26:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 1280
Received: 1265
```



test-results/mobile-ergonomics-Phase-4--a5755-ate-editor-targets-at-320px-mobile/error-context.md

# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-ergonomics.spec.ts >> Phase 4 mobile ergonomics >> exposes 44px BottomNav, picker and template-editor targets at 320px
- Location: tests/e2e/mobile-ergonomics.spec.ts:101:3

# Error details

```
Error: locator.boundingBox: Error: strict mode violation: getByRole('button', { name: /^Plany$/ }) resolved to 2 elements:
    1) <button type="button" class="template-editor-back">…</button> aka getByRole('main').getByRole('button', { name: 'Plany' })
    2) <button tabindex="0" type="button" data-active="true" aria-label="Plany" aria-current="page" class="bottom-nav-button mobile-touch-target flex flex-1 flex-col items-center gap-0.5 py-0.5">…</button> aka getByLabel('Plany')

Call log:
  - waiting for getByRole('button', { name: /^Plany$/ })

```



test-results/dashboard-Dashboard-regres-780a5-d-when-activated-with-Enter-desktop/error-context.md

# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.spec.ts >> Dashboard regressions >> delete action on recent workout stays on dashboard when activated with Enter
- Location: tests/e2e/dashboard.spec.ts:76:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog').filter({ hasText: 'Usunąć ten trening?' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('dialog').filter({ hasText: 'Usunąć ten trening?' })

```



test-results/workbench-lists-History-an-22207-without-horizontal-overflow-desktop/error-context.md

# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workbench-lists.spec.ts >> History and list workbenches >> keeps workbench routes bounded without horizontal overflow
- Location: tests/e2e/workbench-lists.spec.ts:46:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 1440
Received: 1425
```



test-results/workout-mobile-Active-work-7fbb4-es-the-remove-exit-contract-desktop/error-context.md

# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workout-mobile.spec.ts >> Active workout shell reduction >> desktop workout keeps shell chrome visible, mounts one rest timer, and preserves the remove exit contract
- Location: tests/e2e/workout-mobile.spec.ts:710:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "rgba(0, 0, 0, 0)"
Received: "rgba(244, 241, 242, 0.2)"
```

```
Error: [console] Failed to load resource: the server responded with a status of 403 (Forbidden)

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 8

- Array []
+ Array [
+   Object {
+     "blocking": true,
+     "kind": "console",
+     "message": "Failed to load resource: the server responded with a status of 403 (Forbidden)",
+     "url": "http://127.0.0.1:8080/v1/projects/demo-ironlog/databases/(default)/documents:commit?key=demo-api-key",
+   },
+ ]
```
