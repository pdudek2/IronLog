import { createElement, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TemplateEditorPage from '../TemplateEditorPage'
import TopNav from '../../components/TopNav'

const multiDayTemplate = {
  id: 'template-tabs',
  userId: 'user-1',
  name: 'Plan wielodniowy',
  createdAt: 1,
  updatedAt: 2,
  days: [
    {
      name: 'Upper A',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global',
        name: 'Bench Press',
        sets: 4,
        targetReps: 8,
        targetWeight: 60,
      }],
    },
    {
      name: 'Lower A',
      exercises: [
        {
          exerciseId: 'squat',
          exerciseSource: 'global',
          name: 'Squat',
          sets: 3,
          targetReps: 5,
          targetWeight: 100,
        },
        {
          exerciseId: 'rdl',
          exerciseSource: 'global',
          name: 'RDL',
          sets: 2,
          targetReps: 8,
          targetWeight: 80,
        },
      ],
    },
    {
      name: 'Full Body',
      exercises: [],
    },
  ],
}

const mocks = vi.hoisted(() => ({
  units: 'kg' as 'kg' | 'lbs',
  createTemplate: vi.fn(),
  getTemplate: vi.fn(),
  getUserExercises: vi.fn(),
  logoutUser: vi.fn(),
  preloadRouteByPath: vi.fn(),
  updateTemplate: vi.fn(),
}))

vi.mock('../../store/profileStore', () => ({
  useProfileStore: () => ({ profile: { units: mocks.units } }),
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

function getEditorBackButton() {
  const heading = screen.getByRole('heading', { name: /^(Edit plan|New plan)$/ })
  return within(heading.closest('section')!).getByRole('button', { name: 'Plans' })
}

function renderEditor(initialEntry = '/templates/new?draft=ai') {
  const router = createMemoryRouter([
    {
      element: <EditorShell />,
      children: [
        { path: '/templates/new', element: <TemplateEditorPage /> },
        { path: '/templates/:id/edit', element: <TemplateEditorPage /> },
        { path: '/templates', element: <p>Lista plans</p> },
        { path: '/logout', element: <p>Trasa wylogowania</p> },
      ],
    },
  ], { initialEntries: [initialEntry] })

  render(<RouterProvider router={router} />)
  return router
}

describe('TemplateEditorPage accessibility', () => {
  beforeEach(() => {
    mocks.units = 'kg'
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

  it('displays 80 kg as 176.4 lbs and preserves untouched canonical weight on save', async () => {
    mocks.units = 'lbs'
    mocks.getTemplate.mockResolvedValue({
      ...multiDayTemplate,
      days: [{ ...multiDayTemplate.days[0], exercises: [{ ...multiDayTemplate.days[0].exercises[0], targetWeight: 80 }] }],
    })
    renderEditor('/templates/template-tabs/edit')
    const weight = await screen.findByRole('spinbutton', { name: 'Starting weight (lbs) — Bench Press' })
    expect(weight).toHaveValue(176.4)
    expect(weight).toBeValid()
    expect(screen.getByText('Weight (lbs)')).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Renamed plan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Lista plans')
    expect(mocks.updateTemplate.mock.calls[0]?.[1].days[0].exercises[0].targetWeight).toBe(80)
  })

  it.each([
    ['lbs', 132.3, 45.3592],
    ['kg', 60, 100],
  ] as const)('converts only an edited %s weight to canonical kg', async (units, displayed, expectedKg) => {
    mocks.units = units
    renderEditor()
    const weight = await screen.findByRole('spinbutton', { name: `Starting weight (${units}) — Bench Press` })
    expect(weight).toHaveValue(displayed)
    fireEvent.change(weight, { target: { value: '100' } })
    expect(weight).toHaveValue(100)
    expect(weight).toBeValid()
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }))
    await screen.findByText('Lista plans')
    expect(mocks.createTemplate.mock.calls[0]?.[1].days[0].exercises[0].targetWeight).toBe(expectedKg)
  })

  it('names the back action Plans and emphasizes adding an exercise only for an empty day', async () => {
    mocks.getTemplate.mockResolvedValue(multiDayTemplate)
    renderEditor('/templates/template-tabs/edit')
    await screen.findByRole('heading', { name: 'Edit plan' })
    expect(getEditorBackButton()).toHaveAccessibleName('Plans')
    expect(getEditorBackButton()).toHaveTextContent('Plans')
    expect(screen.getByRole('button', { name: 'Add exercise' })).toHaveClass('planner-secondary-action')
    fireEvent.click(screen.getByRole('tab', { name: /Full Body/ }))
    expect(screen.getByRole('button', { name: 'Add exercise' })).toHaveClass('planner-primary-action')
    expect(screen.getByRole('button', { name: 'Add exercise' })).not.toHaveClass('planner-secondary-action')
  })

  it('describes the missing name beside its input after exercises exist', async () => {
    renderEditor()
    const name = await screen.findByRole('textbox', { name: 'Name' })
    fireEvent.change(name, { target: { value: '' } })
    expect(name).toHaveAccessibleDescription('Enter a plan name (at least 2 characters) to save it.')
    expect(screen.getByRole('button', { name: 'Save template' })).toBeDisabled()
    expect(mocks.createTemplate).not.toHaveBeenCalled()
    fireEvent.change(name, { target: { value: 'A' } })
    expect(name).toHaveAttribute('aria-describedby', 'template-name-hint')
    fireEvent.change(name, { target: { value: 'Plan' } })
    expect(name).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByText('Enter a plan name (at least 2 characters) to save it.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save template' })).toBeEnabled()
  })

  it('shows a pristine create draft as not yet saved and invalid', async () => {
    renderEditor('/templates/new')

    expect(await screen.findByText('New plan · not saved yet')).toBeInTheDocument()
    expect(screen.queryByText('Enter a plan name (at least 2 characters) to save it.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save template' })).toBeDisabled()
    expect(screen.getByLabelText('Plan editor summary')).toHaveTextContent('1day')
    expect(document.querySelector('.template-editor-main')).toContainElement(
      screen.getByRole('button', { name: 'Save template in form' }),
    )
  })

  it('labels the plan and day names and gives delete action full context', async () => {
    renderEditor()

    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue('Upper / Lower')
    expect(screen.getByRole('textbox', { name: 'Day name 1' })).toHaveValue('Upper A')
    expect(screen.getByRole('button', {
      name: 'Remove exercise Bench Press from day Upper A',
    })).toBeInTheDocument()
  })

  it('renders related day tabs with summaries and only the selected panel', async () => {
    mocks.getTemplate.mockResolvedValue(multiDayTemplate)
    renderEditor('/templates/template-tabs/edit')

    const tablist = await screen.findByRole('tablist', { name: 'Plan days' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveAttribute('tabindex', '0')
    expect(tabs[0]).toHaveTextContent('Upper A')
    expect(tabs[0]).toHaveTextContent('1 ex. · 4 sets')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[1]).toHaveAttribute('tabindex', '-1')
    expect(tabs[1]).toHaveTextContent('2 ex. · 5 sets')

    const panels = screen.getAllByRole('tabpanel')
    expect(panels).toHaveLength(1)
    expect(tabs[0]).toHaveAttribute('aria-controls', panels[0].id)
    expect(panels[0]).toHaveAttribute('aria-labelledby', tabs[0].id)
    expect(within(panels[0]).getByRole('textbox', { name: 'Day name 1' }))
      .toHaveValue('Upper A')
    expect(screen.queryByRole('textbox', { name: 'Day name 2' })).not.toBeInTheDocument()
  })

  it('switches and focuses day tabs with ArrowLeft, ArrowRight, Home and End', async () => {
    mocks.getTemplate.mockResolvedValue(multiDayTemplate)
    renderEditor('/templates/template-tabs/edit')

    const tabs = within(await screen.findByRole('tablist', { name: 'Plan days' }))
      .getAllByRole('tab')
    tabs[0].focus()

    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    expect(tabs[1]).toHaveFocus()
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveAttribute('tabindex', '-1')
    expect(tabs[1]).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('textbox', { name: 'Day name 2' })).toHaveValue('Lower A')

    fireEvent.keyDown(tabs[1], { key: 'End' })
    expect(tabs[2]).toHaveFocus()
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(tabs[2], { key: 'Home' })
    expect(tabs[0]).toHaveFocus()
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' })
    expect(tabs[2]).toHaveFocus()
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('selects a newly added day', async () => {
    renderEditor()

    await screen.findByRole('tab', { name: /Upper A/ })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add day' })[0])

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('textbox', { name: 'Day name 2' })).toHaveValue('Day 2')
  })

  it('selects the next neighbor when the selected day is removed', async () => {
    mocks.getTemplate.mockResolvedValue(multiDayTemplate)
    renderEditor('/templates/template-tabs/edit')

    const tablist = await screen.findByRole('tablist', { name: 'Plan days' })
    fireEvent.click(within(tablist).getByRole('tab', { name: /Lower A/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove day' }))

    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[1]).toHaveTextContent('Full Body')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('textbox', { name: 'Day name 2' })).toHaveValue('Full Body')
  })

  it('preserves unsaved day fields while switching panels', async () => {
    mocks.getTemplate.mockResolvedValue(multiDayTemplate)
    renderEditor('/templates/template-tabs/edit')

    const tablist = await screen.findByRole('tablist', { name: 'Plan days' })
    const firstDayName = screen.getByRole('textbox', { name: 'Day name 1' })
    fireEvent.change(firstDayName, { target: { value: 'Upper poprawiony' } })

    fireEvent.click(within(tablist).getByRole('tab', { name: /Lower A/ }))
    expect(firstDayName).not.toBeInTheDocument()
    fireEvent.click(within(tablist).getByRole('tab', { name: /Upper poprawiony/ }))

    expect(screen.getByRole('textbox', { name: 'Day name 1' }))
      .toHaveValue('Upper poprawiony')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('treats an imported AI draft as unsaved', async () => {
    renderEditor()

    expect(await screen.findByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save template' })).toBeEnabled()
    fireEvent.click(getEditorBackButton())

    expect(await screen.findByRole('dialog', { name: 'Leave editor?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave without saving' })).toBeEnabled()
  })

  it('keeps a dirty draft when logout is cancelled', async () => {
    const router = renderEditor()
    const name = await screen.findByRole('textbox', { name: 'Name' })
    fireEvent.change(name, { target: { value: 'Upper / Lower zmieniony' } })

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    const dialog = await screen.findByRole('dialog', { name: 'Leave editor?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }))

    expect(router.state.location.pathname).toBe('/templates/new')
    expect(name).toHaveValue('Upper / Lower zmieniony')
    expect(mocks.logoutUser).not.toHaveBeenCalled()
  })

  it('does not allow leaving while template save is pending', async () => {
    let resolveSave!: () => void
    mocks.createTemplate.mockReturnValue(new Promise((resolve) => { resolveSave = () => resolve(undefined) }))
    renderEditor()

    fireEvent.change(await screen.findByRole('textbox', { name: 'Name' }), {
      target: { value: 'Upper / Lower zmieniony' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }))
    fireEvent.click(getEditorBackButton())

    const dialog = await screen.findByRole('dialog', { name: 'Saving in progress' })
    expect(screen.getByRole('button', { name: 'Saving… in the form' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Saving…' })).toBeDisabled()

    resolveSave()
    expect(await screen.findByText('Lista plans')).toBeInTheDocument()
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

    fireEvent.click(await screen.findByRole('button', { name: 'Save template' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    const dialog = await screen.findByRole('dialog', { name: 'Saving in progress' })
    expect(within(dialog).getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(mocks.logoutUser).not.toHaveBeenCalled()

    resolveSave()
    expect(await screen.findByText('Lista plans')).toBeInTheDocument()
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

    fireEvent.click(await screen.findByRole('button', { name: 'Save template' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the plan.')
    fireEvent.click(getEditorBackButton())

    expect(await screen.findByRole('dialog', { name: 'Leave editor?' })).toBeInTheDocument()
  })

  it('keeps the persistent failure while the user edits the draft', async () => {
    mocks.createTemplate.mockRejectedValueOnce(new Error('write failed'))
    renderEditor()

    fireEvent.click(await screen.findByRole('button', { name: 'Save template' }))
    const alert = await screen.findByRole('alert')
    const name = screen.getByRole('textbox', { name: 'Name' })
    fireEvent.change(name, { target: { value: 'Aktualny plan po błędzie' } })

    expect(name).toHaveValue('Aktualny plan po błędzie')
    expect(alert).toHaveTextContent('Could not save the plan.')
  })

  it('revalidates and retries with the current draft instead of the failed payload', async () => {
    mocks.createTemplate
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(undefined)
    renderEditor()

    fireEvent.click(await screen.findByRole('button', { name: 'Save template' }))
    await screen.findByRole('alert')
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Plan poprawiony po błędzie' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Lista plans')).toBeInTheDocument()
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
        name: 'Day siłowy',
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

    const name = await screen.findByRole('textbox', { name: 'Name' })
    const form = name.closest('form')
    expect(name).toHaveValue('Plan zapisany')
    expect(form).not.toBeNull()
    expect(screen.queryByTestId('template-save-dock')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zapisano w formularzu' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Plan editor summary')).toHaveTextContent('1ex.')

    await act(async () => {
      fireEvent.submit(form!)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.updateTemplate).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/templates/template-1/edit')

    fireEvent.change(name, { target: { value: 'Plan zapisany po zmianie' } })
    fireEvent.submit(form!)

    expect(await screen.findByText('Lista plans')).toBeInTheDocument()
    expect(mocks.updateTemplate).toHaveBeenCalledOnce()
    expect(mocks.updateTemplate).toHaveBeenCalledWith('template-1', expect.objectContaining({
      name: 'Plan zapisany po zmianie',
    }))
  })
})
