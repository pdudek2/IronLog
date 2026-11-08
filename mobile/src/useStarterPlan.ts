import { useRef, useState } from 'react'
import { createSessionRevision, PlanRequestError, savePlan } from './firebase'
import { starterPlanInput } from '../../src/shared/planImport'

export function useStarterPlan(uid: string, onCreated: () => void) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A retry after a lost response reuses the operation, so the plan is not created twice.
  const operationId = useRef<string | null>(null)

  async function create() {
    if (saving) return
    operationId.current ??= createSessionRevision()
    setSaving(true); setError(null)
    try {
      await savePlan(uid, { operationId: operationId.current, ...starterPlanInput() })
      operationId.current = null
      onCreated()
    } catch (nextError) {
      setError(nextError instanceof PlanRequestError ? nextError.message : 'Could not add the starter plan. Try again.')
    } finally { setSaving(false) }
  }

  return { create, saving, error }
}
