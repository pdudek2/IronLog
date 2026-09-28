import { templateFingerprint } from '../../src/shared/templateFingerprint'
import type { PlanDraft } from './planEditor'
import type { WorkoutTemplate } from './workoutLaunch'

export async function requestPlanEditorExit(options: {
  flush: () => Promise<void>
  draft: () => PlanDraft | null
  storageFailed: () => boolean
  isCurrent: () => boolean
  confirm: (title: string, message: string, proceed: () => void) => void
  proceed: () => void
}): Promise<void> {
  let failed = false
  try { await options.flush() } catch { failed = true }
  if (!options.isCurrent()) return
  const draft = options.draft()
  if (!draft || (!draft.dirty && !draft.pending && !failed && !options.storageFailed())) {
    options.proceed()
    return
  }
  const unsafe = failed || options.storageFailed()
  const title = unsafe ? 'Draft not stored' : draft.pending ? 'Save outcome unresolved' : 'Leave editor?'
  const message = unsafe ? 'Latest changes could not be saved on this device. Leaving may lose them.'
    : draft.pending ? 'The save operation is stored on this device. Return here to retry it.'
      : 'Your plan draft will remain on this device.'
  options.confirm(title, message, options.proceed)
}

export async function finishAcknowledgedPlanSave(options: {
  draft: () => PlanDraft
  acknowledged: WorkoutTemplate
  read: (id: string) => Promise<WorkoutTemplate | null>
  persist: (draft: PlanDraft) => Promise<void>
  clear: (draft: PlanDraft) => Promise<boolean>
  shouldNavigate: () => boolean
  navigate: () => void
}): Promise<'saved' | 'changed' | 'deleted' | 'newer'> {
  const first = options.draft()
  if (!first.pending) throw new Error('Save operation was lost. Reload the draft.')
  if (!first.targetId && first.resolvedId !== options.acknowledged.id) {
    if (first.resolvedId) throw new Error('Save receipt resolved to another plan.')
    await options.persist({ ...first, resolvedId: options.acknowledged.id })
  }
  const confirmed = await options.read(options.acknowledged.id)
  if (!confirmed || templateFingerprint(confirmed) !== templateFingerprint(first.pending)) {
    await options.persist({ ...options.draft(), pending: null })
    return confirmed ? 'changed' : 'deleted'
  }
  if (!await options.clear(options.draft())) return 'newer'
  if (options.shouldNavigate()) options.navigate()
  return 'saved'
}

export async function releaseRejectedPlanSave(
  status: number,
  draft: PlanDraft,
  persist: (draft: PlanDraft) => Promise<void>,
): Promise<'unknown' | 'correctable' | 'conflict'> {
  if (status < 400 || status >= 500 || status === 408 || status === 429) return 'unknown'
  if (draft.pending) await persist({ ...draft, pending: null })
  return status === 409 || status === 404 ? 'conflict' : 'correctable'
}
