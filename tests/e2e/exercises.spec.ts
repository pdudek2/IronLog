import { test, expect } from './fixtures'
import { deleteUserExerciseByName } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'

const TEST_EXERCISE_NAME = '_E2E Curl Test_'

test.describe('Exercises CRUD', () => {
  test('user exercise CRUD lifecycle is isolated', async ({ page, cleanup }) => {
    await page.goto('/exercises')
    await expectAppReady(page, '/exercises')
    cleanup.add('delete user exercise', () => deleteUserExerciseByName(page, TEST_EXERCISE_NAME))

    await page.screenshot({ path: 'test-results/exercises-list.png' })

    const addBtn = page.getByRole('button', { name: /Dodaj własne/i })
      .or(page.getByRole('button', { name: /Nowe ćwiczenie/i }))
      .first()
    await expect(addBtn).toBeVisible({ timeout: 5_000 })
    await addBtn.click()

    const nameInput = page.getByPlaceholder('np. Banded Pull-apart')
    await expect(nameInput).toBeVisible({ timeout: 5_000 })
    await nameInput.fill(TEST_EXERCISE_NAME)
    await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click()

    await expect(nameInput).not.toBeVisible({ timeout: 8_000 })
    await expect(page.getByText(TEST_EXERCISE_NAME, { exact: false })).toBeVisible({ timeout: 8_000 })
    await page.screenshot({ path: 'test-results/exercises-created.png' })

    const flatLibraryContract = await page.evaluate(() => {
      const activeFilter = document.querySelector<HTMLElement>('.exercise-filter-chip[data-active="true"]')
      const openAffordance = document.querySelector<HTMLElement>('.exercise-library-open')
      const editAction = document.querySelector<HTMLElement>('.exercise-library-row-controls .planner-icon-action')
      const commandPanel = document.querySelector<HTMLElement>('.exercise-command-panel')
      const searchBox = document.querySelector<HTMLElement>('.exercise-search-box')
      const searchInput = searchBox?.querySelector('input')
      if (!activeFilter || !openAffordance || !editAction || !commandPanel || !searchBox || !searchInput) {
        throw new Error('Expected loaded library controls')
      }

      const filterStyle = window.getComputedStyle(activeFilter)
      const openStyle = window.getComputedStyle(openAffordance)
      const editStyle = window.getComputedStyle(editAction)
      const commandStyle = window.getComputedStyle(commandPanel)
      const searchStyle = window.getComputedStyle(searchBox)
      const searchInputStyle = window.getComputedStyle(searchInput)
      return {
        filterRadius: filterStyle.borderTopLeftRadius,
        filterBackground: filterStyle.backgroundColor,
        filterBottomBorder: filterStyle.borderBottomWidth,
        openBorder: openStyle.borderTopWidth,
        openBackground: openStyle.backgroundColor,
        editBorder: editStyle.borderTopWidth,
        editBackground: editStyle.backgroundColor,
        commandBorder: commandStyle.borderTopWidth,
        commandBackground: commandStyle.backgroundColor,
        commandRadius: commandStyle.borderTopLeftRadius,
        searchMinHeight: searchStyle.minHeight,
        searchInputMinHeight: searchInputStyle.minHeight,
      }
    })

    expect(flatLibraryContract).toEqual({
      filterRadius: '0px',
      filterBackground: 'rgba(0, 0, 0, 0)',
      filterBottomBorder: '2px',
      openBorder: '0px',
      openBackground: 'rgba(0, 0, 0, 0)',
      editBorder: '0px',
      editBackground: 'rgba(0, 0, 0, 0)',
      commandBorder: '0px',
      commandBackground: 'rgba(0, 0, 0, 0)',
      commandRadius: '0px',
      searchMinHeight: '44px',
      searchInputMinHeight: '44px',
    })

    await addBtn.click()
    await expect(nameInput).toBeVisible({ timeout: 5_000 })
    await nameInput.fill(TEST_EXERCISE_NAME)
    await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click()

    await expect(page.getByText(/już istnieje|duplicate|ta nazwa|taka nazwa/i)).toBeVisible({ timeout: 8_000 })
    await expect(nameInput).toBeVisible()
    await page.getByLabel('Zamknij formularz').click()

    const editButton = page.getByRole('button', { name: `Edytuj ćwiczenie ${TEST_EXERCISE_NAME}` })
    await expect(editButton).toBeVisible({ timeout: 8_000 })
    await editButton.click()
    await expect(nameInput).toBeVisible({ timeout: 5_000 })
    await expect(nameInput).toHaveValue(TEST_EXERCISE_NAME)
    await page.getByRole('combobox').first().selectOption('back')
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click()
    await expect(nameInput).not.toBeVisible({ timeout: 8_000 })
    await expect(page.getByText(TEST_EXERCISE_NAME, { exact: false })).toBeVisible()
    await page.screenshot({ path: 'test-results/exercises-edited.png' })

    await editButton.click()
    await expect(nameInput).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: 'Usuń ćwiczenie' }).click()
    const confirmDialog = page.getByRole('dialog', { name: 'Potwierdź akcję' })
    await expect(confirmDialog).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Edytuj własne ćwiczenie' })).toHaveCount(0)
    await page.screenshot({ path: 'test-results/exercises-delete-confirm.png' })
    await confirmDialog.getByRole('button', { name: 'Usuń' }).click()
    await expect(page.getByText(TEST_EXERCISE_NAME, { exact: false })).not.toBeVisible({ timeout: 8_000 })
    await page.screenshot({ path: 'test-results/exercises-deleted.png' })
  })

  test('global exercise detail page is reachable', async ({ page }) => {
    await page.goto('/exercises')
    await expectAppReady(page, '/exercises')

    const globalSection = page.locator('section').filter({ hasText: 'Katalog globalny' })
    const firstGlobalCard = globalSection.locator('.exercise-library-row-main').first()
    await expect(firstGlobalCard).toBeVisible({ timeout: 8_000 })
    await firstGlobalCard.click()

    await expect(page).toHaveURL(/\/exercises\/global\//, { timeout: 5_000 })
    await expect(page.locator('.hero-editorial-name')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Nie udało się wczytać ćwiczenia', { exact: true })).toHaveCount(0)
    await page.screenshot({ path: 'test-results/exercises-detail.png' })
  })
})
