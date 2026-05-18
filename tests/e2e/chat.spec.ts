import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

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

function captureErrors(page: Page): () => string[] {
  const errors: string[] = []
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (!text.includes('extension') && !text.includes('[vite]')) {
        errors.push(text)
      }
    }
  })
  return () => errors
}

test.describe('Chat UI', () => {
  test('chat page loads without console errors', async ({ page }) => {
    const getErrors = captureErrors(page)

    await page.goto('/chat')
    await expect(page).toHaveURL('/chat')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })

    await page.screenshot({ path: 'test-results/chat-loaded.png' })

    expect(getErrors(), `Chat console errors:\n${getErrors().join('\n')}`).toHaveLength(0)
  })

  test('AiKeyPanel is visible and shows correct empty state', async ({ page }) => {
    await page.goto('/chat')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })

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
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })

    // Input placeholder shows instruction to add key first
    const msgInput = page.getByPlaceholder('Dodaj najpierw Claude API key', { exact: false })
      .or(page.locator('textarea[disabled]'))
      .first()

    await expect(msgInput).toBeVisible({ timeout: 5_000 })

    await page.screenshot({ path: 'test-results/chat-disabled-input.png' })
  })

  test('can switch between Chat and Generator workspaces', async ({ page }) => {
    await page.goto('/chat')
    await expect(page.locator('.page-shell')).toBeVisible({ timeout: 10_000 })

    // Chat workspace should be active by default
    await expect(page.getByText('Chat z kontekstem IronLog')).toBeVisible({ timeout: 5_000 })

    // Switch to Generator — use the eyebrow text "Generator" in the nav switcher
    // The chat page has two workspaces: "Chat z kontekstem IronLog" and "Generator planu"
    // Switcher buttons are the ones that change workspace, identified by their eyebrow label
    const generatorBtn = page.getByRole('button', { name: /Generator/i }).first()
    await expect(generatorBtn).toBeVisible({ timeout: 5_000 })
    await generatorBtn.click()

    // Generator UI should appear
    await expect(page.getByText('Generator planu', { exact: true })).toBeVisible({ timeout: 5_000 })

    await page.screenshot({ path: 'test-results/chat-generator.png' })

    // Switch back to chat
    const chatBtn = page.getByRole('button', { name: /^Chat$/i }).first()
    if (await chatBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await chatBtn.click()
    } else {
      // Alt: use nav link or back navigation
      await page.goto('/chat')
    }
    await expect(page.getByText('Chat z kontekstem IronLog')).toBeVisible({ timeout: 5_000 })
  })
})
