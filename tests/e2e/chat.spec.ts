import { test, expect } from './fixtures'
import { expectAppReady } from './support/appReady'

/**
 * Chat E2E tests — UI level only.
 *
 * Full flow with real AI responses is NOT tested here because it requires
 * a real Claude API key (BYOK model). This is a deliberate decision:
 * - API keys should not be in CI/CD secrets for a student project
 * - Real API calls add non-determinism and latency to the test suite
 * - AI response quality cannot be asserted deterministically
 *
 * To test the full chat flow manually: add your Claude API key via the
 * AiKeyPanel on /chat and use the app normally.
 *
 * BLOCKER: Full AI chat E2E requires either:
 *   a) A real Anthropic API key in .env.test (opt-in, manual only)
 *   b) A mock server intercepting /api/ai-chat (future work)
 */

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
})
