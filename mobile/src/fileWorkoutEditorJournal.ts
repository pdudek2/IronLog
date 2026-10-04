import { Directory, File, Paths } from 'expo-file-system'
import { WorkoutEditorJournal } from './workoutEditorJournal'
const directory = new Directory(Paths.document, 'workout-editor')
const file = (key: string, slot: 0 | 1) => new File(directory, `${encodeURIComponent(key)}.${slot}.json`)
export const workoutEditorJournal = new WorkoutEditorJournal({
  async read(key, slot) { const f = file(key, slot); return f.exists ? f.text() : null },
  async write(key, slot, value) {
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true })
    const f = file(key, slot); if (!f.exists) f.create({ intermediates: true }); f.write(value)
  },
})
