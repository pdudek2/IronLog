import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '../store/authStore'
import { createTemplate, type WorkoutTemplate } from '../lib/templateService'
import { starterPlanInput } from '../shared/planImport'

export function useStarterPlan(onCreated: (template: WorkoutTemplate) => void) {
  const { user } = useAuthStore()
  const [saving, setSaving] = useState(false)
  // A retry after a lost response reuses the operation, so the plan is not created twice.
  const operationId = useRef<string | null>(null)

  async function create() {
    if (!user || saving) return
    operationId.current ??= crypto.randomUUID()
    setSaving(true)
    try {
      const template = await createTemplate(user.uid, starterPlanInput(), operationId.current)
      operationId.current = null
      toast.success('Starter plan added')
      onCreated(template)
    } catch {
      toast.error('Could not add the starter plan. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return { create, saving }
}
