import { adminDb } from '../api/_lib/firebaseAdmin.js'
import { exercises } from '../data/exercises.js'

const BATCH_SIZE = 500

async function seedExercises() {
  const col = adminDb.collection('exercises')
  const total = exercises.length

  console.log(`Seeding ${total} exercises to Firestore...`)

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = adminDb.batch()
    const slice = exercises.slice(i, i + BATCH_SIZE)

    for (const exercise of slice) {
      const ref = col.doc(exercise.id)
      batch.set(ref, {
        name: exercise.name,
        category: exercise.category,
        equipment: exercise.equipment,
        muscles: exercise.muscles,
        source: 'builtin',
      })
    }

    await batch.commit()
    console.log(`  ✓ Committed ${slice.length} exercises (${i + slice.length}/${total})`)
  }

  console.log('Done.')
  process.exit(0)
}

seedExercises().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
