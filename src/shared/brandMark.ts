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

// Stick-slip, the motion of shear: the block starts whole, strains under static friction, then slips to rest.
// `offsets` move the upper part in mark units (-140 puts it directly over the lower part), `times` are ms,
// `ease` holds one cubic-bezier per segment. Tremor amplitudes read as 1-2 px at 24-48 px wide.
export const BRAND_MARK_SLIP = {
  times: [0, 40, 80, 120, 160, 200, 320, 440],
  offsets: [-140, -120, -158, -118, -162, -140, 16, 0],
  ease: [LINEAR, LINEAR, LINEAR, LINEAR, LINEAR, [0.25, 1, 0.5, 1] as Bezier, [0.45, 0, 0.55, 1] as Bezier],
  // The cut turns red only once the slip starts; until then the seam is filled like the block.
  slipAt: 200,
  // Loaders rest on the finished mark this long before playing again.
  loopPause: 1100,
  // The seam is as wide as the upper part and moves with it; clipped to the lower part's span it is their overlap.
  seam: { x: 382, y: 479, width: 400, height: 36 },
  clip: { x: 242, width: 400 },
} as const
