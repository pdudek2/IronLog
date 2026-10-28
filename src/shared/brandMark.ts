// The SHEAR mark at UI sizes: one block cut above its middle, the top part slid right, the cut shown in red.
// Same geometry as public/app-icon-source.svg, with a thicker cut so it survives 16-32 px.
export const BRAND_MARK = {
  viewBox: '242 272 540 480',
  upper: 'M382 479 V328 L438 272 H726 L782 328 V479 Z',
  cut: { x: 382, y: 479, width: 260, height: 36 },
  lower: 'M242 515 H642 V696 L586 752 H298 L242 696 Z',
} as const
