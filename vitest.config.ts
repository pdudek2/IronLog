import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    env: {
      VITE_FIREBASE_API_KEY: 'test-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'test-ironlog.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'test-ironlog',
      VITE_FIREBASE_STORAGE_BUCKET: 'test-ironlog.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
      VITE_FIREBASE_APP_ID: '1:123456789:web:test',
    },
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
            'scripts/**/__tests__/**/*.test.ts',
            'tests/e2e/support/**/*.test.ts',
          ],
          exclude: ['**/node_modules/**', '**/dist/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/__tests__/**/*.test.tsx'],
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
