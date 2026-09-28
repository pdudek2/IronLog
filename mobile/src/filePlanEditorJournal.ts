import { Directory, File, Paths } from 'expo-file-system'
import { PlanEditorJournal, type PlanDraftSlots } from './planEditorJournal'

class FilePlanDraftSlots implements PlanDraftSlots {
  private readonly directory = new Directory(Paths.document, 'plan-editor')
  private file(key: string, slot: 0 | 1): File { return new File(this.directory, `${encodeURIComponent(key)}.${slot}.json`) }
  async read(key: string, slot: 0 | 1): Promise<string | null> {
    const file = this.file(key, slot)
    return file.exists ? file.text() : null
  }
  async write(key: string, slot: 0 | 1, value: string): Promise<void> {
    if (!this.directory.exists) this.directory.create({ idempotent: true, intermediates: true })
    const file = this.file(key, slot)
    if (!file.exists) file.create({ intermediates: true })
    file.write(value)
  }
}

export const planEditorJournal = new PlanEditorJournal(new FilePlanDraftSlots())
