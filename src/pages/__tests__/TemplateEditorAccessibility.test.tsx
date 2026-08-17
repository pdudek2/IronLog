import { createElement, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TemplateEditorPage from '../TemplateEditorPage'
import TopNav from '../../components/TopNav'

const mocks = vi.hoisted(() => ({
  createTemplate: vi.fn(),
  getTemplate: vi.fn(),
  getUserExercises: vi.fn(),
  logoutUser: vi.fn(),
  preloadRouteByPath: vi.fn(),
  updateTemplate: vi.fn(),
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: { uid: 'user-1' } }),
}))
vi.mock('../../lib/userExercisesService', () => ({
  getUserExercises: mocks.getUserExercises,
}))
vi.mock('../../lib/auth', () => ({
  logoutUser: mocks.logoutUser,
}))
vi.mock('../../router/pageLoaders', () => ({
  preloadRouteByPath: mocks.preloadRouteByPath,
}))
vi.mock('../../lib/templateDraftStorage', () => ({
  readTemplateDraft: () => ({
    name: 'Upper / Lower',
    days: [{
      name: 'Upper A',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: 4,
        targetReps: 8,
        targetWeight: 60,
      }],
    }],
  }),
  clearTemplateDraft: vi.fn(),
}))
vi.mock('../../lib/templateService', () => ({
  createTemplate: mocks.createTemplate,
  getTemplate: mocks.getTemplate,
  updateTemplate: mocks.updateTemplate,
}))
vi.mock('../../components/ExercisePicker', () => ({ default: () => null }))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}))
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  motion: new Proxy({}, {
    get: (_target, tag: string | symbol) => {
      if (typeof tag !== 'string') return undefined
      return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
        delete props.initial
        delete props.animate
        delete props.exit
        delete props.transition
        delete props.whileTap
        return createElement(tag, props, children)
      }
    },
  }),
}))

function EditorShell() {
  return (
    <>
      <TopNav />
      <Outlet />
    </>
  )
}

function renderEditor(initialEntry = '/templates/new?draft=ai') {
  const router = createMemoryRouter([
    {
      element: <EditorShell />,
      children: [
        { path: '/templates/new', element: <TemplateEditorPage /> },
        { path: '/templates/:id/edit', element: <TemplateEditorPage /> },
        { path: '/templates', element: <p>Lista planów</p> },
        { path: '/logout', element: <p>Trasa wylogowania</p> },
      ],
    },
  ], { initialEntries: [initialEntry] })

  render(<RouterProvider router={router} />)
  return router
}

describe('TemplateEditorPage accessibility', () => {
  beforeEach(() => {
    mocks.createTemplate.mockReset()
    mocks.createTemplate.mockResolvedValue(undefined)
    mocks.getTemplate.mockReset()
    mocks.getTemplate.mockResolvedValue(null)
    mocks.getUserExercises.mockReset()
    mocks.getUserExercises.mockResolvedValue([])
    mocks.logoutUser.mockReset()
    mocks.logoutUser.mockResolvedValue(undefined)
    mocks.preloadRouteByPath.mockReset()
    mocks.preloadRouteByPath.mockResolvedValue(undefined)
    mocks.updateTemplate.mockReset()
    mocks.updateTemplate.mockResolvedValue(undefined)
  })

  it('shows a pristine create draft as not yet saved and invalid', async () => {
    renderEditor('/templates/new')

    expect(await screen.findByText('Nowy plan · jeszcze niezapisany')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zapisz szablon' })).toBeDisabled()
    expect(screen.getByLabelText('Podsumowanie edytowanego planu')).toHaveTextContent('1dzień')
    expect(document.querySelector('.template-editor-main')).toContainElement(
      screen.getByRole('button', { name: 'Zapisz szablon w formularzu' }),
    )
  })

  it('labels the plan and day names and gives delete action full context', async () => {
    renderEditor()

    expect(await screen.findByRole('textbox', { name: 'Nazwa' })).toHaveValue('Upper / Lower')
    expect(screen.getByRole('textbox', { name: 'Dzień 1' })).toHaveValue('Upper A')
    expect(screen.getByRole('button', {
      name: 'Usuń ćwiczenie Bench Press z dnia Upper A',
    })).toBeInTheDocument()
  })

  it('treats an imported AI draft as unsaved', async () => {
    renderEditor()

    expect(await screen.findByText('Niezapisane zmiany')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zapisz szablon' })).toBeEnabled()
    fireEvent.click(await screen.findByRole('button', { name: 'Wróć' }))

    expect(await screen.findByRole('dialog', { name: 'Opuścić edytor?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Opuść bez zapisu' })).toBeEnabled()
  })

  it('keeps a dirty draft when logout is cancelled', async () => {
    const router = renderEditor()
    const name = await screen.findByRole('textbox', { name: 'Nazwa' })
    fireEvent.change(name, { target: { value: 'Upper / Lower zmieniony' } })

    fireEvent.click(screen.getByRole('button', { name: 'Wyloguj' }))

    const dialog = await screen.findByRole('dialog', { name: 'Opuścić edytor?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zostań' }))

    expect(router.state.location.pathname).toBe('/templates/new')
    expect(name).toHaveValue('Upper / Lower zmieniony')
    expect(mocks.logoutUser).not.toHaveBeenCalled()
  })

  it('does not allow leaving while template save is pending', async () => {
    let resolveSave!: () => void
    mocks.createTemplate.mockReturnValue(new Promise((resolve) => { resolveSave = () => resolve(undefined) }))
    renderEditor()

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nazwa' }), {
      target: { value: 'Upper / Lower zmieniony' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz szablon' }))
    fireEvent.click(screen.getByRole('button', { name: 'Wróć' }))

    const dialog = await screen.findByRole('dialog', { name: 'Zapis w toku' })
    expect(screen.getByRole('button', { name: 'Zapisuję… w formularzu' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Zapisuję…' })).toBeDisabled()

    resolveSave()
    expect(await screen.findByText('Lista planów')).toBeInTheDocument()
  })

  it('keeps logout blocked during save and lets save success win', async () => {
    let resolveSave!: () => void
    let settleLogoutPreload!: () => void
    const logoutPreload = new Promise<void>((resolve) => { settleLogoutPreload = resolve })
    mocks.createTemplate.mockReturnValue(new Promise((resolve) => { resolveSave = () => resolve(undefined) }))
    mocks.preloadRouteByPath.mockImplementation((path: string) => (
      path === '/logout' ? logoutPreload : Promise.resolve()
    ))
    const router = renderEditor()

    fireEvent.click(await screen.findByRole('button', { name: 'Zapisz szablon' }))
    fireEvent.click(screen.getByRole('button', { name: 'Wyloguj' }))

    const dialog = await screen.findByRole('dialog', { name: 'Zapis w toku' })
    expect(within(dialog).getByRole('button', { name: 'Zapisuję…' })).toBeDisabled()
    expect(mocks.logoutUser).not.toHaveBeenCalled()

    resolveSave()
    expect(await screen.findByText('Lista planów')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/templates'))

    settleLogoutPreload()
    await Promise.resolve()
    await Promise.resolve()

    expect(router.state.location.pathname).toBe('/templates')
    expect(mocks.logoutUser).not.toHaveBeenCalled()
  })

  it('keeps a failed save visible and preserves the dirty leave guard', async () => {
    mocks.createTemplate.mockRejectedValueOnce(new Error('write failed'))
    renderEditor()

    fireEvent.click(await screen.findByRole('button', { name: 'Zapisz szablon' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się zapisać planu.')
    fireEvent.click(screen.getByRole('button', { name: 'Wróć' }))

    expect(await screen.findByRole('dialog', { name: 'Opuścić edytor?' })).toBeInTheDocument()
  })

  it('keeps the persistent failure while the user edits the draft', async () => {
    mocks.createTemplate.mockRejectedValueOnce(new Error('write failed'))
    renderEditor()

    fireEvent.click(await screen.findByRole('button', { name: 'Zapisz szablon' }))
    const alert = await screen.findByRole('alert')
    const name = screen.getByRole('textbox', { name: 'Nazwa' })
    fireEvent.change(name, { target: { value: 'Aktualny plan po błędzie' } })

    expect(name).toHaveValue('Aktualny plan po błędzie')
    expect(alert).toHaveTextContent('Nie udało się zapisać planu.')
  })

  it('revalidates and retries with the current draft instead of the failed payload', async () => {
    mocks.createTemplate
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(undefined)
    renderEditor()

    fireEvent.click(await screen.findByRole('button', { name: 'Zapisz szablon' }))
    await screen.findByRole('alert')
    fireEvent.change(screen.getByRole('textbox', { name: 'Nazwa' }), {
      target: { value: 'Plan poprawiony po błędzie' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(await screen.findByText('Lista planów')).toBeInTheDocument()
    expect(mocks.createTemplate).toHaveBeenCalledTimes(2)
    expect(mocks.createTemplate.mock.calls[0]?.[1]).toMatchObject({ name: 'Upper / Lower' })
    expect(mocks.createTemplate.mock.calls[1]?.[1]).toMatchObject({ name: 'Plan poprawiony po błędzie' })
  })

  it('loads an existing template as persisted and clean', async () => {
    mocks.getTemplate.mockResolvedValue({
      id: 'template-1',
      userId: 'user-1',
      name: 'Plan zapisany',
      createdAt: 1,
      updatedAt: 2,
      days: [{
        name: 'Dzień siłowy',
        exercises: [{
          exerciseId: 'bench-press',
          exerciseSource: 'global',
          name: 'Bench Press',
          sets: 4,
          targetReps: 8,
          targetWeight: 60,
        }],
      }],
    })
    const router = renderEditor('/templates/template-1/edit')

    const name = await screen.findByRole('textbox', { name: 'Nazwa' })
    const form = name.closest('form')
    expect(name).toHaveValue('Plan zapisany')
    expect(form).not.toBeNull()
    expect(screen.queryByTestId('template-save-dock')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zapisano w formularzu' })).toBeDisabled()
    expect(screen.getByLabelText('Podsumowanie edytowanego planu')).toHaveTextContent('1ćw.')

    await act(async () => {
      fireEvent.submit(form!)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.updateTemplate).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/templates/template-1/edit')

    fireEvent.change(name, { target: { value: 'Plan zapisany po zmianie' } })
    fireEvent.submit(form!)

    expect(await screen.findByText('Lista planów')).toBeInTheDocument()
    expect(mocks.updateTemplate).toHaveBeenCalledOnce()
    expect(mocks.updateTemplate).toHaveBeenCalledWith('template-1', expect.objectContaining({
      name: 'Plan zapisany po zmianie',
    }))
  })
})
