import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

interface VercelHeader {
  key: string
  value: string
}

interface VercelConfig {
  headers: Array<{
    headers: VercelHeader[]
  }>
}

function localCspHeader(): string {
  const vercelConfig = JSON.parse(
    readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'),
  ) as VercelConfig
  const policy = vercelConfig.headers
    .flatMap((entry) => entry.headers)
    .find(({ key }) => key === 'Content-Security-Policy')
    ?.value

  if (!policy) {
    throw new Error('Missing enforced Content-Security-Policy header.')
  }

  const localPolicy = policy.replace(
    /connect-src ([^;]+);/,
    'connect-src $1 http://127.0.0.1:8080 http://127.0.0.1:9099;',
  )
  if (localPolicy === policy) {
    throw new Error('Missing connect-src directive.')
  }
  return localPolicy
}

export default defineConfig(() => {
  const emulatorMode = process.env.E2E_BACKEND === 'emulator'
  const cspMode = process.env.E2E_CSP === 'true'

  return {
    envDir: emulatorMode ? 'tests/e2e/env' : undefined,
    plugins: [react(), tailwindcss()],
    preview: cspMode
      ? {
          headers: {
            'Content-Security-Policy': localCspHeader(),
          },
        }
      : undefined,
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  }
})
