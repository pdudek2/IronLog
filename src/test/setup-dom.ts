import '@testing-library/jest-dom/vitest'

window.matchMedia ??= (query) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}) as unknown as MediaQueryList
