import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/**/__tests__/**/*.test.ts',
            'src/**/*.test.ts',
            'api/**/__tests__/**/*.test.ts',
            'server/**/__tests__/**/*.test.ts',
          ],
          exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/pages/__tests__/**/*.test.tsx'],
          setupFiles: ['src/test/setup-dom.ts'],
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
