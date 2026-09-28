import { templateFingerprint } from '../../src/shared/templateFingerprint'
import type { WorkoutTemplate } from './workoutLaunch'

export async function inspectPlanForDelete(
  plan: WorkoutTemplate,
  action: { id: string; status: 'checking' | 'deleting' | 'error' } | null,
  retry: boolean,
  read: (id: string) => Promise<WorkoutTemplate | null>,
): Promise<{ kind: 'busy' } | { kind: 'absent' } | { kind: 'changed' } | { kind: 'confirm'; current: WorkoutTemplate; baseline: string }> {
  if (action && !(retry && action.status === 'error' && action.id === plan.id)) return { kind: 'busy' }
  const current = await read(plan.id)
  if (!current) return { kind: 'absent' }
  const baseline = templateFingerprint(current)
  return baseline === templateFingerprint(plan) ? { kind: 'confirm', current, baseline } : { kind: 'changed' }
}
