export const SHEET_SPRING = { stiffness: 380, damping: 38, mass: 0.9 } as const
export const SHEET_DRAG_ELASTIC = 0.6

export function shouldDismissSheet(offsetY: number, velocityY: number): boolean {
  return offsetY > 96 || velocityY > 500
}
