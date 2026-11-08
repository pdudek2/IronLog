export type Category = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'cardio'
export type Equipment = 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight' | 'kettlebell'
export type MuscleGroup =
  | 'chest' | 'back' | 'quads' | 'hamstrings' | 'glutes' | 'adductors'
  | 'shoulders' | 'triceps' | 'biceps' | 'forearms' | 'core' | 'calves'

export interface Exercise {
  id: string
  name: string
  category: Category
  equipment: Equipment
  muscles: MuscleGroup[]
  // Other names, Polish and English, used only to recognise pasted text and in search; the UI shows `name`.
  aliases?: readonly string[]
}

export const exercises: Exercise[] = [
  { id: 'bench-press', name: 'Bench Press', category: 'chest', equipment: 'barbell', muscles: ['chest', 'triceps', 'shoulders'], aliases: ['wyciskanie na ławce', 'wyciskanie na ławce płaskiej', 'wyciskanie sztangi na ławce', 'wyciskanie sztangi na ławce płaskiej', 'wyciskanie sztangi leżąc', 'wyciskanie leżąc', 'wyciskanie szeroko', 'wyciskanie szerokim chwytem', 'barbell bench press', 'flat bench press', 'bench'] },
  { id: 'incline-bench', name: 'Incline Bench Press', category: 'chest', equipment: 'barbell', muscles: ['chest', 'shoulders'], aliases: ['wyciskanie na skosie', 'wyciskanie na ławce skośnej', 'wyciskanie sztangi na skosie', 'incline barbell press', 'incline press'] },
  { id: 'db-bench-press', name: 'Dumbbell Bench Press', category: 'chest', equipment: 'dumbbell', muscles: ['chest', 'triceps', 'shoulders'], aliases: ['wyciskanie hantli', 'wyciskanie hantli na ławce', 'wyciskanie hantli leżąc', 'db bench press', 'dumbbell press'] },
  { id: 'incline-db-press', name: 'Incline Dumbbell Press', category: 'chest', equipment: 'dumbbell', muscles: ['chest', 'shoulders'], aliases: ['wyciskanie hantli na skosie', 'wyciskanie hantli na ławce skośnej', 'incline db press', 'incline dumbbell bench press'] },
  { id: 'decline-bench', name: 'Decline Bench Press', category: 'chest', equipment: 'barbell', muscles: ['chest', 'triceps'], aliases: ['wyciskanie na skosie ujemnym', 'wyciskanie na ławce ujemnej', 'decline press'] },
  { id: 'chest-press', name: 'Machine Chest Press', category: 'chest', equipment: 'machine', muscles: ['chest', 'triceps', 'shoulders'], aliases: ['wyciskanie na maszynie', 'maszyna do wyciskania', 'chest press', 'machine press'] },
  { id: 'db-fly', name: 'Dumbbell Fly', category: 'chest', equipment: 'dumbbell', muscles: ['chest'], aliases: ['rozpiętki', 'rozpiętki z hantlami', 'rozpiętki hantlami', 'dumbbell flyes', 'flyes'] },
  { id: 'pec-deck', name: 'Pec Deck', category: 'chest', equipment: 'machine', muscles: ['chest'], aliases: ['butterfly', 'motylek', 'rozpiętki na maszynie', 'machine fly', 'pec fly'] },
  { id: 'cable-crossover', name: 'Cable Crossover', category: 'chest', equipment: 'cable', muscles: ['chest'], aliases: ['krzyżowanie linek', 'krzyżowanie linek wyciągu', 'rozpiętki na wyciągu', 'brama', 'cable fly'] },
  { id: 'dips', name: 'Dips', category: 'chest', equipment: 'bodyweight', muscles: ['chest', 'triceps', 'shoulders'], aliases: ['dipy', 'pompki na poręczach', 'poręcze', 'dip', 'chest dips'] },
  { id: 'db-pullover', name: 'Dumbbell Pullover', category: 'chest', equipment: 'dumbbell', muscles: ['chest', 'back'], aliases: ['przenoszenie hantla za głowę', 'przenoszenie hantli za głowę', 'pullover'] },
  { id: 'push-up', name: 'Push-up', category: 'chest', equipment: 'bodyweight', muscles: ['chest', 'triceps'], aliases: ['pompki', 'pompka', 'push ups', 'pushup', 'pushups'] },

  { id: 'deadlift', name: 'Deadlift', category: 'back', equipment: 'barbell', muscles: ['back', 'glutes', 'hamstrings'], aliases: ['martwy ciąg', 'martwy ciąg klasyczny', 'martwy', 'deadlifts', 'conventional deadlift'] },
  { id: 'pull-up', name: 'Pull-up', category: 'back', equipment: 'bodyweight', muscles: ['back', 'biceps'], aliases: ['podciąganie', 'podciąganie na drążku', 'podciąganie nachwytem', 'pull ups', 'pullup', 'pullups'] },
  { id: 'chin-up', name: 'Chin-up', category: 'back', equipment: 'bodyweight', muscles: ['back', 'biceps'], aliases: ['podciąganie podchwytem', 'chin ups', 'chinup', 'chinups'] },
  { id: 'assisted-pull-up', name: 'Assisted Pull-up', category: 'back', equipment: 'machine', muscles: ['back', 'biceps'], aliases: ['podciąganie z asystą', 'podciąganie na maszynie', 'assisted pullup', 'assisted pull ups'] },
  { id: 'barbell-row', name: 'Barbell Row', category: 'back', equipment: 'barbell', muscles: ['back', 'biceps'], aliases: ['wiosłowanie sztangą', 'wiosłowanie sztangą w opadzie', 'wiosłowanie w opadzie', 'bent over row', 'barbell rows'] },
  { id: 't-bar-row', name: 'T-Bar Row', category: 'back', equipment: 'barbell', muscles: ['back', 'biceps'], aliases: ['wiosłowanie t bar', 'wiosłowanie końcem sztangi', 'tbar row'] },
  { id: 'lat-pulldown', name: 'Lat Pulldown', category: 'back', equipment: 'cable', muscles: ['back', 'biceps'], aliases: ['ściąganie drążka', 'ściąganie drążka wyciągu', 'ściąganie drążka do klatki', 'ściąganie wyciągu górnego', 'ściąganie drążka wyciągu górnego', 'pulldown', 'lat pull down'] },
  { id: 'straight-arm-pulldown', name: 'Straight-Arm Pulldown', category: 'back', equipment: 'cable', muscles: ['back'], aliases: ['ściąganie prostymi ramionami', 'ściąganie drążka prostymi rękami', 'pullover na wyciągu'] },
  { id: 'seated-cable-row', name: 'Seated Cable Row', category: 'back', equipment: 'cable', muscles: ['back', 'biceps'], aliases: ['wiosłowanie na wyciągu', 'wiosłowanie na wyciągu dolnym', 'wiosłowanie siedząc', 'przyciąganie linki wyciągu dolnego', 'cable row', 'low row'] },
  { id: 'machine-row', name: 'Machine Row', category: 'back', equipment: 'machine', muscles: ['back', 'biceps'], aliases: ['wiosłowanie na maszynie', 'hammer row', 'chest supported row'] },
  { id: 'db-row', name: 'Dumbbell Row', category: 'back', equipment: 'dumbbell', muscles: ['back', 'biceps'], aliases: ['wiosłowanie hantlem', 'wiosłowanie hantlą', 'wiosłowanie hantlami', 'one arm row', 'dumbbell rows'] },
  { id: 'back-extension', name: 'Back Extension', category: 'back', equipment: 'bodyweight', muscles: ['back', 'glutes', 'hamstrings'], aliases: ['prostowanie tułowia', 'wyprosty tułowia', 'ławka rzymska', 'rzymska ławka', 'hiperekstensje', 'hyperextension', 'back extensions'] },
  { id: 'shrug', name: 'Shrug', category: 'back', equipment: 'dumbbell', muscles: ['back'], aliases: ['szrugsy', 'wzruszanie ramion', 'wzruszanie ramionami', 'shrugs'] },

  { id: 'squat', name: 'Squat', category: 'legs', equipment: 'barbell', muscles: ['quads', 'glutes'], aliases: ['przysiad', 'przysiady', 'przysiad ze sztangą', 'przysiad tylny', 'back squat', 'squats'] },
  { id: 'front-squat', name: 'Front Squat', category: 'legs', equipment: 'barbell', muscles: ['quads', 'glutes', 'core'], aliases: ['przysiad przedni', 'przysiady przednie', 'front squats'] },
  { id: 'hack-squat', name: 'Hack Squat', category: 'legs', equipment: 'machine', muscles: ['quads', 'glutes'], aliases: ['hack przysiad', 'przysiad hack', 'przysiad na maszynie', 'hack'] },
  { id: 'goblet-squat', name: 'Goblet Squat', category: 'legs', equipment: 'dumbbell', muscles: ['quads', 'glutes'], aliases: ['przysiad goblet', 'przysiad z hantlem', 'goblet'] },
  { id: 'bulgarian-split-squat', name: 'Bulgarian Split Squat', category: 'legs', equipment: 'dumbbell', muscles: ['quads', 'glutes'], aliases: ['przysiad bułgarski', 'przysiady bułgarskie', 'bułgarskie', 'split squat', 'bulgarian'] },
  { id: 'romanian-dl', name: 'Romanian Deadlift', category: 'legs', equipment: 'barbell', muscles: ['hamstrings', 'glutes'], aliases: ['martwy ciąg rumuński', 'martwy rumuński', 'rumuński martwy ciąg', 'rdl', 'romanian deadlifts'] },
  { id: 'sumo-deadlift', name: 'Sumo Deadlift', category: 'legs', equipment: 'barbell', muscles: ['glutes', 'hamstrings', 'quads', 'adductors'], aliases: ['martwy ciąg sumo', 'sumo'] },
  { id: 'good-morning', name: 'Good Morning', category: 'legs', equipment: 'barbell', muscles: ['hamstrings', 'back'], aliases: ['dzień dobry', 'skłony ze sztangą', 'good mornings'] },
  { id: 'hip-thrust', name: 'Hip Thrust', category: 'legs', equipment: 'barbell', muscles: ['glutes', 'hamstrings'], aliases: ['hip thrusty', 'wypychanie bioder', 'unoszenie bioder ze sztangą', 'barbell hip thrust'] },
  { id: 'leg-press', name: 'Leg Press', category: 'legs', equipment: 'machine', muscles: ['quads', 'glutes'], aliases: ['suwnica', 'wypychanie nóg', 'wypychanie na suwnicy', 'wypychanie nóg na suwnicy', 'prasa'] },
  { id: 'leg-curl', name: 'Leg Curl', category: 'legs', equipment: 'machine', muscles: ['hamstrings'], aliases: ['uginanie nóg', 'uginanie nóg leżąc', 'uginanie nóg na maszynie', 'leg curls', 'lying leg curl'] },
  { id: 'seated-leg-curl', name: 'Seated Leg Curl', category: 'legs', equipment: 'machine', muscles: ['hamstrings'], aliases: ['uginanie nóg siedząc', 'seated leg curls'] },
  { id: 'leg-extension', name: 'Leg Extension', category: 'legs', equipment: 'machine', muscles: ['quads'], aliases: ['prostowanie nóg', 'prostowanie nóg na maszynie', 'wyprosty nóg', 'leg extensions'] },
  { id: 'hip-adduction', name: 'Hip Adduction', category: 'legs', equipment: 'machine', muscles: ['adductors'], aliases: ['przywodzenie', 'przywodzenie nóg', 'przywodzenie ud', 'przywodziciele na maszynie', 'maszyna przywodziciele', 'adductor machine', 'hip adductor'] },
  { id: 'hip-abduction', name: 'Hip Abduction', category: 'legs', equipment: 'machine', muscles: ['glutes'], aliases: ['odwodzenie', 'odwodzenie nóg', 'odwodzenie ud', 'odwodziciele na maszynie', 'maszyna odwodziciele', 'abductor machine', 'hip abductor'] },
  { id: 'lunge', name: 'Lunge', category: 'legs', equipment: 'dumbbell', muscles: ['quads', 'glutes'], aliases: ['wykroki', 'wypady', 'wykroki z hantlami', 'lunges', 'walking lunge'] },
  { id: 'step-up', name: 'Step-up', category: 'legs', equipment: 'dumbbell', muscles: ['quads', 'glutes'], aliases: ['wejścia na skrzynię', 'wchodzenie na skrzynię', 'wejścia na ławkę', 'step ups'] },
  { id: 'calf-raise', name: 'Calf Raise', category: 'legs', equipment: 'machine', muscles: ['calves'], aliases: ['wspięcia na palce', 'wspięcia na palce stojąc', 'wspięcia', 'standing calf raise', 'calf raises'] },
  { id: 'seated-calf-raise', name: 'Seated Calf Raise', category: 'legs', equipment: 'machine', muscles: ['calves'], aliases: ['wspięcia na palce siedząc', 'seated calf raises'] },
  { id: 'kettlebell-swing', name: 'Kettlebell Swing', category: 'legs', equipment: 'kettlebell', muscles: ['glutes', 'hamstrings'], aliases: ['swing', 'swingi', 'wymachy kettlebell', 'kb swing', 'kettlebell swings'] },

  { id: 'ohp', name: 'Overhead Press', category: 'shoulders', equipment: 'barbell', muscles: ['shoulders', 'triceps'], aliases: ['ohp', 'wyciskanie żołnierskie', 'wyciskanie sztangi nad głowę', 'wyciskanie nad głowę', 'military press'] },
  { id: 'db-shoulder-press', name: 'Dumbbell Shoulder Press', category: 'shoulders', equipment: 'dumbbell', muscles: ['shoulders', 'triceps'], aliases: ['wyciskanie hantli nad głowę', 'wyciskanie hantli siedząc', 'db shoulder press', 'seated dumbbell press'] },
  { id: 'machine-shoulder-press', name: 'Machine Shoulder Press', category: 'shoulders', equipment: 'machine', muscles: ['shoulders', 'triceps'], aliases: ['wyciskanie nad głowę na maszynie', 'shoulder press machine', 'shoulder press'] },
  { id: 'arnold-press', name: 'Arnold Press', category: 'shoulders', equipment: 'dumbbell', muscles: ['shoulders', 'triceps'], aliases: ['arnoldki', 'wyciskanie arnolda'] },
  { id: 'db-lateral-raise', name: 'Lateral Raise', category: 'shoulders', equipment: 'dumbbell', muscles: ['shoulders'], aliases: ['wznosy bokiem', 'barki bokiem', 'wznosy hantli bokiem', 'unoszenie ramion bokiem', 'unoszenie hantli bokiem', 'lateral raises', 'side raise', 'dumbbell lateral raise'] },
  { id: 'cable-lateral-raise', name: 'Cable Lateral Raise', category: 'shoulders', equipment: 'cable', muscles: ['shoulders'], aliases: ['wznosy bokiem na wyciągu', 'unoszenie ramion bokiem na wyciągu', 'cable lateral raises'] },
  { id: 'front-raise', name: 'Front Raise', category: 'shoulders', equipment: 'dumbbell', muscles: ['shoulders'], aliases: ['wznosy przodem', 'unoszenie ramion przodem', 'unoszenie hantli przodem', 'front raises'] },
  { id: 'reverse-fly', name: 'Reverse Fly', category: 'shoulders', equipment: 'dumbbell', muscles: ['shoulders', 'back'], aliases: ['odwrotne rozpiętki', 'rozpiętki w opadzie', 'wznosy w opadzie', 'reverse flyes', 'rear delt fly'] },
  { id: 'reverse-pec-deck', name: 'Reverse Pec Deck', category: 'shoulders', equipment: 'machine', muscles: ['shoulders', 'back'], aliases: ['odwrotny butterfly', 'odwrotne rozpiętki na maszynie', 'reverse butterfly', 'rear delt machine'] },
  { id: 'face-pull', name: 'Face Pull', category: 'shoulders', equipment: 'cable', muscles: ['shoulders', 'back'], aliases: ['face pulle', 'przyciąganie liny do twarzy', 'face pulls'] },
  { id: 'upright-row', name: 'Upright Row', category: 'shoulders', equipment: 'barbell', muscles: ['shoulders'], aliases: ['podciąganie sztangi wzdłuż tułowia', 'wiosłowanie stojąc', 'upright rows'] },

  { id: 'barbell-curl', name: 'Barbell Curl', category: 'arms', equipment: 'barbell', muscles: ['biceps'], aliases: ['uginanie ramion ze sztangą', 'uginanie ze sztangą', 'biceps ze sztangą', 'barbell curls'] },
  { id: 'db-curl', name: 'Dumbbell Curl', category: 'arms', equipment: 'dumbbell', muscles: ['biceps'], aliases: ['uginanie ramion z hantlami', 'uginanie z hantlami', 'uginanie hantli', 'biceps z hantlami', 'dumbbell curls', 'db curl'] },
  { id: 'hammer-curl', name: 'Hammer Curl', category: 'arms', equipment: 'dumbbell', muscles: ['biceps', 'forearms'], aliases: ['uginanie młotkowe', 'młotki', 'hammer curls'] },
  { id: 'incline-db-curl', name: 'Incline Dumbbell Curl', category: 'arms', equipment: 'dumbbell', muscles: ['biceps'], aliases: ['uginanie na ławce skośnej', 'uginanie hantli na skosie', 'incline curl', 'incline curls'] },
  { id: 'preacher-curl', name: 'Preacher Curl', category: 'arms', equipment: 'barbell', muscles: ['biceps'], aliases: ['modlitewnik', 'uginanie na modlitewniku', 'preacher curls'] },
  { id: 'cable-curl', name: 'Cable Curl', category: 'arms', equipment: 'cable', muscles: ['biceps'], aliases: ['uginanie na wyciągu', 'biceps na wyciągu', 'cable curls'] },
  { id: 'concentration-curl', name: 'Concentration Curl', category: 'arms', equipment: 'dumbbell', muscles: ['biceps'], aliases: ['uginanie w podporze o kolano', 'uginanie koncentryczne', 'concentration curls'] },
  { id: 'tricep-pushdown', name: 'Tricep Pushdown', category: 'arms', equipment: 'cable', muscles: ['triceps'], aliases: ['prostowanie ramion na wyciągu', 'prostowanie przedramion na wyciągu', 'triceps na wyciągu', 'triceps wyciąg', 'triceps pushdown', 'pushdown', 'rope pushdown'] },
  { id: 'skull-crusher', name: 'Skull Crusher', category: 'arms', equipment: 'barbell', muscles: ['triceps'], aliases: ['wyciskanie francuskie', 'wyciskanie francuskie leżąc', 'francuz', 'skull crushers', 'skullcrusher'] },
  { id: 'overhead-tri-ext', name: 'Overhead Tricep Extension', category: 'arms', equipment: 'dumbbell', muscles: ['triceps'], aliases: ['wyciskanie francuskie siedząc', 'prostowanie ramion nad głową', 'triceps nad głową', 'overhead triceps extension', 'overhead extension'] },
  { id: 'close-grip-bench', name: 'Close-Grip Bench Press', category: 'arms', equipment: 'barbell', muscles: ['triceps', 'chest'], aliases: ['wyciskanie wąsko', 'wyciskanie wąskim chwytem', 'close grip bench'] },
  { id: 'tricep-kickback', name: 'Tricep Kickback', category: 'arms', equipment: 'dumbbell', muscles: ['triceps'], aliases: ['prostowanie ramienia w opadzie', 'kickback', 'kickbacki', 'triceps kickback'] },
  { id: 'wrist-curl', name: 'Wrist Curl', category: 'arms', equipment: 'dumbbell', muscles: ['forearms'], aliases: ['uginanie nadgarstków', 'wrist curls'] },

  { id: 'plank', name: 'Plank', category: 'core', equipment: 'bodyweight', muscles: ['core'], aliases: ['deska', 'planka'] },
  { id: 'crunch', name: 'Crunch', category: 'core', equipment: 'bodyweight', muscles: ['core'], aliases: ['brzuszki', 'spięcia brzucha', 'crunches'] },
  { id: 'cable-crunch', name: 'Cable Crunch', category: 'core', equipment: 'cable', muscles: ['core'], aliases: ['allahy', 'brzuszki na wyciągu', 'spięcia na wyciągu', 'kneeling cable crunch'] },
  { id: 'hanging-leg-raise', name: 'Hanging Leg Raise', category: 'core', equipment: 'bodyweight', muscles: ['core'], aliases: ['unoszenie nóg w zwisie', 'wznosy nóg w zwisie', 'hanging leg raises'] },
  { id: 'lying-leg-raise', name: 'Lying Leg Raise', category: 'core', equipment: 'bodyweight', muscles: ['core'], aliases: ['unoszenie nóg leżąc', 'wznosy nóg leżąc', 'lying leg raises'] },
  { id: 'russian-twist', name: 'Russian Twist', category: 'core', equipment: 'bodyweight', muscles: ['core'], aliases: ['skręty rosyjskie', 'russian twists'] },
  { id: 'ab-wheel', name: 'Ab Wheel Rollout', category: 'core', equipment: 'bodyweight', muscles: ['core'], aliases: ['kółko', 'kółko do brzucha', 'ab rollout', 'ab wheel'] },
  { id: 'farmer-walk', name: "Farmer's Walk", category: 'core', equipment: 'dumbbell', muscles: ['forearms', 'core'], aliases: ['spacer farmera', 'chód farmera', 'farmer walk', 'farmers carry'] },

  { id: 'treadmill', name: 'Treadmill', category: 'cardio', equipment: 'machine', muscles: [], aliases: ['bieżnia', 'bieg na bieżni', 'running'] },
  { id: 'stationary-bike', name: 'Stationary Bike', category: 'cardio', equipment: 'machine', muscles: [], aliases: ['rower', 'rowerek', 'rower stacjonarny', 'spinning', 'bike'] },
  { id: 'elliptical', name: 'Elliptical', category: 'cardio', equipment: 'machine', muscles: [], aliases: ['orbitrek', 'orbitrek eliptyczny', 'cross trainer'] },
  { id: 'stair-climber', name: 'Stair Climber', category: 'cardio', equipment: 'machine', muscles: [], aliases: ['schody', 'stepper', 'stairmaster'] },
  { id: 'rowing-machine', name: 'Rowing Machine', category: 'cardio', equipment: 'machine', muscles: [], aliases: ['wioślarz', 'ergometr wioślarski', 'rowing', 'rower erg'] },
  { id: 'jump-rope', name: 'Jump Rope', category: 'cardio', equipment: 'bodyweight', muscles: [], aliases: ['skakanka', 'skakanie na skakance', 'skipping rope'] },
]

// Lower case, no Polish letters, punctuation as spaces: how pasted names and search queries are compared.
export function normalizeExerciseName(value: string): string {
  return value.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

export function searchExercises(query: string, category?: Category): Exercise[] {
  const normalizedQuery = normalizeExerciseName(query)
  return exercises.filter((exercise) => (
    (category ? exercise.category === category : true)
    && (normalizedQuery
      ? [exercise.name, ...(exercise.aliases ?? [])].some((name) => normalizeExerciseName(name).includes(normalizedQuery))
      : true)
  ))
}
