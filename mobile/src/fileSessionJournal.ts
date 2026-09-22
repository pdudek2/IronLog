import { Directory, File, Paths } from 'expo-file-system'

import { TwoSlotSessionJournal, type JournalSlotStorage } from './sessionJournal'
import type { ClosureIntentStorage } from './workoutClosure'

class FileJournalStorage implements JournalSlotStorage {
  private readonly directory = new Directory(Paths.document, 'session-journal')

  private file(uid: string, slot: 0 | 1): File {
    return new File(this.directory, `${encodeURIComponent(uid)}.${slot}.json`)
  }

  async read(uid: string, slot: 0 | 1): Promise<string | null> {
    const file = this.file(uid, slot)
    return file.exists ? file.text() : null
  }

  async write(uid: string, slot: 0 | 1, value: string): Promise<void> {
    if (!this.directory.exists) this.directory.create({ idempotent: true, intermediates: true })
    const file = this.file(uid, slot)
    if (!file.exists) file.create({ intermediates: true })
    file.write(value)
  }
}

export const sessionJournal = new TwoSlotSessionJournal(new FileJournalStorage())

class FileClosureIntentStorage implements ClosureIntentStorage {
  private readonly directory = new Directory(Paths.document, 'closure-intent')

  private file(uid: string): File {
    return new File(this.directory, `${encodeURIComponent(uid)}.json`)
  }

  async read(uid: string): Promise<string | null> {
    const file = this.file(uid)
    return file.exists ? file.text() : null
  }

  async write(uid: string, value: string): Promise<void> {
    if (!this.directory.exists) this.directory.create({ idempotent: true, intermediates: true })
    const file = this.file(uid)
    if (!file.exists) file.create({ intermediates: true })
    file.write(value)
  }

  async clear(uid: string): Promise<void> {
    const file = this.file(uid)
    if (file.exists) file.delete()
  }
}

export const closureIntentStorage = new FileClosureIntentStorage()
