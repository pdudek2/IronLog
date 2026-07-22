import { test, expect, type Page } from './fixtures'
import { expectAppReady } from './support/appReady'
import { installMockAiRuntime, type MockAiAttempt } from './support/mockAiStream'

/**
 * Chat E2E tests use a browser-local NDJSON runtime for AI lifecycle coverage.
 * No Anthropic request or test API key leaves the browser context.
 */

const QUESTION = 'Czy progresuję?'

async function openChatWithMock(page: Page, attempts: MockAiAttempt[]) {
  await installMockAiRuntime(page, attempts)
  await page.goto('/chat')
  await expectAppReady(page, '/chat')
  await expect(page.getByRole('textbox', { name: 'Wiadomość do AI Coacha' })).toBeEnabled()
}

async function sendQuestion(page: Page) {
  await page.getByRole('textbox', { name: 'Wiadomość do AI Coacha' }).fill(QUESTION)
  await page.getByRole('button', { name: 'Wyślij' }).click()
}

async function expectAbortCount(page: Page, count: number) {
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __ironlogMockAiAbortCount?: number }
  ).__ironlogMockAiAbortCount ?? 0)).toBe(count)
}

test.describe('Chat UI', () => {
  test('chat page loads without console errors', async ({ page }) => {
    await page.goto('/chat')
    await expectAppReady(page, '/chat')

    await page.screenshot({ path: 'test-results/chat-loaded.png' })

  })

  test('AiKeyPanel is visible and shows correct empty state', async ({ page }) => {
    await page.goto('/chat')
    await expectAppReady(page, '/chat')

    // Key panel should show "Brak klucza" badge when no key is configured
    // (assuming test account has no saved key — localStorage is fresh per storageState)
    await expect(page.getByPlaceholder('Wklej Claude API key')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Klucz zostaje tylko na tym urządzeniu.', { exact: true }))
      .toBeVisible({ timeout: 5_000 })

    await expect(page.getByRole('button', { name: 'Usuń lokalnie zapisany klucz' }))
      .toBeDisabled()

    await page.screenshot({ path: 'test-results/chat-key-panel.png' })
  })

  test('message input is disabled without API key', async ({ page }) => {
    await page.goto('/chat')
    await expectAppReady(page, '/chat')

    // Input placeholder shows instruction to add key first
    const msgInput = page.getByPlaceholder('Dodaj Claude API key, żeby odblokować czat', { exact: false })
      .or(page.locator('textarea[disabled]'))
      .first()

    await expect(msgInput).toBeVisible({ timeout: 5_000 })

    await page.screenshot({ path: 'test-results/chat-disabled-input.png' })
  })

  test('can switch between conversation and plan workspaces', async ({ page }) => {
    await page.goto('/chat')
    await expectAppReady(page, '/chat')

    await expect(page.getByRole('heading', { name: 'Decyzje treningowe' })).toBeVisible({ timeout: 5_000 })

    const modeSwitch = page.locator('.coach-mode-switch')
    const planBtn = modeSwitch.getByRole('button', { name: /^Plan/i })
    await expect(planBtn).toBeVisible({ timeout: 5_000 })
    await planBtn.click()

    await expect(page.getByRole('heading', { name: 'Brief treningowy' })).toBeVisible({ timeout: 5_000 })

    await page.screenshot({ path: 'test-results/chat-generator.png' })

    const conversationBtn = modeSwitch.getByRole('button', { name: /^Rozmowa/i })
    await conversationBtn.click()
    await expect(page.getByRole('heading', { name: 'Decyzje treningowe' })).toBeVisible({ timeout: 5_000 })
  })

  test('mock runtime rejects invalid AI request contracts without consuming an attempt', async ({ page }) => {
    await openChatWithMock(page, [{
      frames: [
        { delayMs: 20, frame: { type: 'chunk', text: 'Pełna odpowiedź' } },
        { delayMs: 20, frame: { type: 'done' } },
      ],
    }])

    const contractResults = await page.evaluate(async () => {
      const jsonHeaders = {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      }
      const cases: Array<[string, RequestInit]> = [
        ['/api/ai-models', { method: 'GET' }],
        ['/api/ai-models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: 'test-only-key' }),
        }],
        ['/api/ai-models', {
          method: 'POST',
          headers: { Authorization: 'Bearer test-token', 'Content-Type': 'text/plain' },
          body: JSON.stringify({ apiKey: 'test-only-key' }),
        }],
        ['/api/ai-models', { method: 'POST', headers: jsonHeaders, body: '{' }],
        ['/api/ai-models', { method: 'POST', headers: jsonHeaders, body: '{}' }],
        ['/api/ai-chat', { method: 'GET' }],
        ['/api/ai-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: 'test-only-key', model: 'claude-test', messages: [] }),
        }],
        ['/api/ai-chat', {
          method: 'POST',
          headers: { Authorization: 'Bearer test-token', 'Content-Type': 'text/plain' },
          body: JSON.stringify({ apiKey: 'test-only-key', model: 'claude-test', messages: [] }),
        }],
        ['/api/ai-chat', { method: 'POST', headers: jsonHeaders, body: '{' }],
        ['/api/ai-chat', {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({
            apiKey: 'test-only-key',
            model: 'claude-test',
            messages: [{ role: 'system', content: 'invalid role' }],
          }),
        }],
      ]

      return Promise.all(cases.map(async ([url, init]) => {
        try {
          await fetch(url, init)
          return 'resolved'
        } catch (error) {
          return error instanceof Error ? error.message : 'non-error rejection'
        }
      }))
    })

    expect(contractResults).toEqual([
      'Mock AI request contract violation: /api/ai-models requires POST.',
      'Mock AI request contract violation: /api/ai-models requires Bearer authorization.',
      'Mock AI request contract violation: /api/ai-models requires application/json Content-Type.',
      'Mock AI request contract violation: /api/ai-models requires valid JSON.',
      'Mock AI request contract violation: /api/ai-models requires body { apiKey }.',
      'Mock AI request contract violation: /api/ai-chat requires POST.',
      'Mock AI request contract violation: /api/ai-chat requires Bearer authorization.',
      'Mock AI request contract violation: /api/ai-chat requires application/json Content-Type.',
      'Mock AI request contract violation: /api/ai-chat requires valid JSON.',
      'Mock AI request contract violation: /api/ai-chat requires body { apiKey, model, messages }.',
    ])

    await sendQuestion(page)
    await expect(page.getByText('Pełna odpowiedź', { exact: true })).toBeVisible()
  })

  test('attaches limited context to the completed answer', async ({ page }) => {
    await openChatWithMock(page, [{
      contextHeader: 'limited;unavailable=readiness,records',
      frames: [
        { delayMs: 20, frame: { type: 'chunk', text: 'Odpowiedź z częściowym kontekstem' } },
        { delayMs: 20, frame: { type: 'done' } },
      ],
    }])

    await sendQuestion(page)
    await expect(page.getByRole('status')).toContainText(
      'Odpowiedź powstała bez części danych: gotowości i rekordów.',
    )
    await expect(page.getByText('Odpowiedź z częściowym kontekstem', { exact: true })).toBeVisible()
  })

  test('attaches limited context to the generated plan preview', async ({ page }) => {
    await installMockAiRuntime(page, [{
      kind: 'plan',
      contextHeader: 'limited;unavailable=profile,workouts',
      plan: {
        name: 'Plan testowy',
        summary: 'Plan z ograniczonym kontekstem',
        days: [{ name: 'Upper', exercises: [] }],
      },
    }])
    await page.goto('/chat')
    await expectAppReady(page, '/chat')
    await page.getByRole('group', { name: 'Tryb AI Coacha' })
      .getByRole('button', { name: /^Plan/ }).click()
    await page.getByRole('textbox', { name: 'Cel planu' }).fill('Budowa siły')
    await page.getByRole('button', { name: 'Generuj plan' }).click()

    await expect(page.getByRole('heading', { name: 'Plan testowy' })).toBeVisible()
    await expect(page.getByRole('status')).toContainText(
      'Plan powstał bez części danych: profilu i treningów.',
    )
  })

  test('retries after total context failure without duplicating the question', async ({ page }) => {
    await openChatWithMock(page, [
      { kind: 'error', status: 503, message: 'Nie udało się załadować kontekstu. Spróbuj ponownie.' },
      {
        frames: [
          { delayMs: 20, frame: { type: 'chunk', text: 'Odpowiedź po ponowieniu' } },
          { delayMs: 20, frame: { type: 'done' } },
        ],
      },
    ])

    await sendQuestion(page)
    await expect(page.getByRole('alert')).toContainText('Nie udało się załadować kontekstu.')
    await page.getByRole('button', { name: 'Ponów odpowiedź AI' }).click()

    await expect(page.getByText('Odpowiedź po ponowieniu', { exact: true })).toBeVisible()
    await expect(page.getByText(QUESTION, { exact: true })).toHaveCount(1)
  })

  test('removes a partial answer and exposes retry after a stream error', async ({ page }) => {
    await openChatWithMock(page, [{
      frames: [
        { delayMs: 20, frame: { type: 'chunk', text: 'Częściowa odpowiedź' } },
        { delayMs: 150, frame: { type: 'error', message: 'Połączenie zostało zerwane.' } },
      ],
    }])

    await sendQuestion(page)
    await expect(page.getByText('Częściowa odpowiedź', { exact: true })).toBeVisible()
    await expect(page.getByText('Częściowa odpowiedź', { exact: true })).toHaveCount(0)
    await expect(page.getByText(QUESTION, { exact: true })).toHaveCount(1)

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Połączenie zostało zerwane.')
    const retry = page.getByRole('button', { name: 'Ponów odpowiedź AI' })
    await expect(retry).toBeVisible()
    await retry.focus()
    await expect(retry).toBeFocused()
    await page.screenshot({ path: 'test-results/chat-stream-failed.png', fullPage: true })
  })

  test('aborts on mode switch and retries without duplicating the question', async ({ page }) => {
    await openChatWithMock(page, [
      {
        frames: [{ delayMs: 20, frame: { type: 'chunk', text: 'Częściowa odpowiedź' } }],
        holdOpen: true,
      },
      {
        frames: [
          { delayMs: 20, frame: { type: 'chunk', text: 'Pełna odpowiedź' } },
          { delayMs: 20, frame: { type: 'done' } },
        ],
      },
    ])

    await sendQuestion(page)
    await expect(page.getByText('Częściowa odpowiedź', { exact: true })).toBeVisible()

    const modeSwitch = page.getByRole('group', { name: 'Tryb AI Coacha' })
    await modeSwitch.getByRole('button', { name: /^Plan/i }).click()
    await expectAbortCount(page, 1)
    await expect(page.getByRole('heading', { name: 'Brief treningowy' })).toBeVisible()

    await modeSwitch.getByRole('button', { name: /^Rozmowa/i }).click()
    await expect(page.getByRole('status')).toContainText('Generowanie przerwane')
    await expect(page.getByText('Częściowa odpowiedź', { exact: true })).toHaveCount(0)
    await page.screenshot({ path: 'test-results/chat-stream-interrupted.png', fullPage: true })

    await expect(page.getByText(QUESTION, { exact: true })).toHaveCount(1)
    await page.getByRole('button', { name: 'Ponów odpowiedź AI' }).click()
    await expect(page.getByText('Pełna odpowiedź', { exact: true })).toBeVisible()
    await expect(page.getByText(QUESTION, { exact: true })).toHaveCount(1)
  })

  test('aborts on Reset and ignores late assistant text', async ({ page }) => {
    await openChatWithMock(page, [{
      frames: [
        { delayMs: 20, frame: { type: 'chunk', text: 'Częściowa odpowiedź' } },
        { delayMs: 250, frame: { type: 'chunk', text: 'Spóźniony tekst' } },
      ],
      holdOpen: true,
    }])

    await sendQuestion(page)
    await expect(page.getByText('Częściowa odpowiedź', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Reset' }).click()
    await expectAbortCount(page, 1)

    await expect(page.getByText('Zacznij od pytania', { exact: true })).toBeVisible()
    await expect(page.getByText(QUESTION, { exact: true })).toHaveCount(0)
    await expect(page.getByText('Częściowa odpowiedź', { exact: true })).toHaveCount(0)
    await page.waitForTimeout(350)
    await expect(page.getByText('Spóźniony tekst', { exact: true })).toHaveCount(0)
  })
})
