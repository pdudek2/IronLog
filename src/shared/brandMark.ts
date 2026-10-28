// The SHEAR mark at UI sizes: one block cut above its middle, the top part slid right, the cut shown in red.
// Same geometry as public/app-icon-source.svg, with a thicker cut so it survives 16-32 px.
export const BRAND_MARK = {
  viewBox: '242 272 540 480',
  upper: 'M382 479 V328 L438 272 H726 L782 328 V479 Z',
  cut: { x: 382, y: 479, width: 260, height: 36 },
  lower: 'M242 515 H642 V696 L586 752 H298 L242 696 Z',
} as const

type Bezier = readonly [number, number, number, number]
const LINEAR: Bezier = [0, 0, 1, 1]

// The slip, the motion of shear: the block holds whole, then the upper part slides smoothly to rest.
// `offsets` move the upper part in mark units (-140 puts it directly over the lower part), `times` are ms,
// `ease` holds one cubic-bezier per segment. `cover` is the opacity of the block-coloured fill over the seam:
// the cut fades in red as the slide starts. `red` keeps the red seam fully on whenever the cover is not opaque,
// and off under an opaque cover, so its antialiased edge leaves no red fringe on the whole block.
export type SlipTrack = {
  times: readonly number[]
  offsets: readonly number[]
  ease: readonly Bezier[]
  cover: { times: readonly number[]; opacity: readonly number[] }
  red: { times: readonly number[]; opacity: readonly number[] }
}

const SLIDE: Bezier = [0.16, 1, 0.3, 1]
const SLIDE_BACK: Bezier = [0.65, 0, 0.35, 1]

export const BRAND_MARK_SLIP = {
  once: {
    times: [0, 350, 800],
    offsets: [-140, -140, 0],
    ease: [LINEAR, SLIDE],
    cover: { times: [0, 350, 450, 800], opacity: [1, 1, 0, 0] },
    red: { times: [0, 350, 351, 800], opacity: [0, 0, 1, 1] },
  } satisfies SlipTrack,
  // Loaders start on the finished mark, so a quick load shows the plain mark; a longer one rests, fades the cut out
  // while sliding back whole, holds, and plays the same slip.
  loop: {
    times: [0, 1100, 1550, 2150, 2600],
    offsets: [0, 0, -140, -140, 0],
    ease: [LINEAR, SLIDE_BACK, LINEAR, SLIDE],
    cover: { times: [0, 1100, 1250, 2150, 2250, 2600], opacity: [0, 0, 1, 1, 0, 0] },
    red: { times: [0, 1249, 1250, 2150, 2151, 2600], opacity: [1, 1, 0, 0, 1, 1] },
  } satisfies SlipTrack,
  // The seam is as wide as the upper part and moves with it; clipped to the lower part's span it is their overlap.
  seam: { x: 382, y: 479, width: 400, height: 36 },
  clip: { x: 242, width: 400 },
} as const
