export function polishPlural(
  value: number,
  singular: string,
  paucal: string,
  plural: string,
): string {
  const absolute = Math.abs(value)
  const lastDigit = absolute % 10
  const lastTwoDigits = absolute % 100

  if (absolute === 1) return singular
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return paucal
  }
  return plural
}
