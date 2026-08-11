# Final fix report — 2026-08-11

## Scope

- Desktop top navigation hit areas only.
- No redesign, no selector churn, no unrelated file edits.

## Root cause

- `.top-nav-link` and `.top-nav-cta` rendered below the 44px minimum target height on desktop.
- The new desktop Playwright geometry contract failed at `36.765625px` before the CSS fix.

## Changes

- Added `min-height: 2.75rem` to `.top-nav-link` in `src/index.css`.
- Added `min-height: 2.75rem` to `.top-nav-cta` in `src/index.css`.
- Extended `tests/e2e/accessibility.spec.ts` with a desktop contract that checks all visible primary nav buttons plus the workout CTA for `height >= 44`.
- Kept the existing mobile brand/readiness hit-area contract unchanged.

## TDD record

1. Added the desktop geometry test first.
2. Verified red with:
   `playwright test tests/e2e/accessibility.spec.ts --project=desktop --grep 'desktop top navigation actions expose at least 44px hit areas'`
3. Applied the minimal CSS fix.
4. Verified green with:
   `playwright test tests/e2e/accessibility.spec.ts --project=desktop --project=mobile --grep 'hit areas'`

## Validation

- `npm run lint`
- `npm run build`
- Targeted Playwright hit-area geometry on desktop and mobile under emulator auth/firestore

## Touched files

- `src/index.css`
- `tests/e2e/accessibility.spec.ts`
- `.superpowers/sdd/2026-08-11-puls-final-visual-polish/final-fix-report.md`
