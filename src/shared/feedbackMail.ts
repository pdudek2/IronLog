export const FEEDBACK_EMAIL = 'shear.app@proton.me'

// The footer helps reproduce a report without an account id or any training data.
export function feedbackMailto(info: { platform: string; system: string; version: string; date: Date }): string {
  const footer = [
    '',
    '',
    '---',
    `Platform: ${info.platform}`,
    `System: ${info.system}`,
    `Version: ${info.version}`,
    `Date: ${info.date.toISOString().slice(0, 10)}`,
  ].join('\n')
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('SHEAR feedback')}&body=${encodeURIComponent(footer)}`
}
