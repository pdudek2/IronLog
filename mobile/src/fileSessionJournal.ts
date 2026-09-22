import { Directory, File, Paths } from 'expo-file-system'

import { TwoSlotSessionJournal, type JournalSlotStorage } from './sessionJournal'

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
