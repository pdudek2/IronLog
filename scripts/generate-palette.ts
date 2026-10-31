import { writeFileSync } from 'node:fs'
import { paletteCss } from '../src/shared/palette'

writeFileSync('src/palette.generated.css', paletteCss())
