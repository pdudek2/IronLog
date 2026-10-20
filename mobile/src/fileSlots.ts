import { Directory, File, Paths } from 'expo-file-system'

// Two journal slots per key in one document directory, shared by every native journal. A slot is written to a
// temporary file and then moved over the old one, so a crash mid-write keeps the previous slot instead of leaving a
// truncated file that reads as corrupt.
export function fileSlots(directoryName: string) {
  const directory = new Directory(Paths.document, directoryName)
  const file = (key: string, slot: 0 | 1, suffix = '') => new File(directory, `${encodeURIComponent(key)}.${slot}.json${suffix}`)
  return {
    directory,
    async read(key: string, slot: 0 | 1): Promise<string | null> {
      const current = file(key, slot)
      return current.exists ? current.text() : null
    },
    async write(key: string, slot: 0 | 1, value: string): Promise<void> {
      if (!directory.exists) directory.create({ idempotent: true, intermediates: true })
      const temporary = file(key, slot, '.tmp')
      if (!temporary.exists) temporary.create({ intermediates: true })
      temporary.write(value)
      temporary.moveSync(file(key, slot), { overwrite: true })
    },
  }
}
