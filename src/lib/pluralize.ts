export function pluralize(value: number, singular: string, plural: string): string {
  return Math.abs(value) === 1 ? singular : plural
}
