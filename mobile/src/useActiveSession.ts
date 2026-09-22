import { useEffect, useMemo, useState } from 'react'

import {
  ActiveSessionController,
  stateForAccount,
  type ActiveSessionState,
} from './activeSessionController'
import {
  createSessionRevision,
  isNativeActiveSessionConflict,
  isTransientFirestoreError,
  readUnits,
  saveExistingActiveSession,
  subscribeToActiveSession,
} from './firebase'
import { sessionJournal } from './fileSessionJournal'

const initialState: ActiveSessionState = { status: 'loading', session: null, units: 'kg' }

export function useActiveSession(uid: string | null) {
  const [scopedState, setScopedState] = useState<{ uid: string | null; state: ActiveSessionState }>({
    uid: null,
    state: initialState,
  })
  const controller = useMemo(
    () => new ActiveSessionController(
      {
        subscribe: subscribeToActiveSession,
        readUnits,
        save: saveExistingActiveSession,
        createRevision: createSessionRevision,
        isConflictError: isNativeActiveSessionConflict,
        isTransientError: isTransientFirestoreError,
        journal: sessionJournal,
      },
      (state) => setScopedState({ uid, state }),
    ),
    [uid],
  )

  useEffect(() => {
    if (uid) controller.start(uid)
    else controller.clear()
    return () => controller.dispose()
  }, [controller, uid])

  return {
    state: stateForAccount(uid, scopedState.uid, scopedState.state),
    retry: () => controller.retry(),
    retrySave: () => controller.retrySave(),
    discardLocalChanges: () => controller.discardLocalChanges(),
    updateSet: controller.updateSet.bind(controller),
    adjustSet: controller.adjustSet.bind(controller),
    setDone: controller.setDone.bind(controller),
    addSet: controller.addSet.bind(controller),
    removeSet: controller.removeSet.bind(controller),
    addExercise: controller.addExercise.bind(controller),
    removeExercise: controller.removeExercise.bind(controller),
    setLabel: controller.setLabel.bind(controller),
  }
}
