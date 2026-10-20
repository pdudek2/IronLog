import { File } from 'expo-file-system'

import { fileSlots } from './fileSlots'
import { TwoSlotSessionJournal } from './sessionJournal'
import { ClosureIntentJournal } from './workoutClosure'
import { LaunchJournal } from './launchJournal'

export const sessionJournal = new TwoSlotSessionJournal(fileSlots('session-journal'))

const closureSlots = fileSlots('closure-intent')
// The single-file format from before the two slots; a device may still hold one, so it is read and then cleared.
const legacyClosureFile = (uid: string) => new File(closureSlots.directory, `${encodeURIComponent(uid)}.json`)

export const closureIntentStorage = new ClosureIntentJournal({
  read: closureSlots.read,
  write: closureSlots.write,
  async readLegacy(uid: string): Promise<string | null> {
    const file = legacyClosureFile(uid)
    return file.exists ? file.text() : null
  },
  async clearLegacy(uid: string): Promise<void> {
    const file = legacyClosureFile(uid)
    if (file.exists) file.delete()
  },
})

export const launchJournal = new LaunchJournal(fileSlots('launch-attempt'))
