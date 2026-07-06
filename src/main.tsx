import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import { Toaster } from 'sonner'
import './index.css'
import AppRouter from './router'
import AnalyticsConsentBanner from './components/AnalyticsConsentBanner'
import { initAuthListener } from './lib/auth'
import { initAnalytics } from './lib/analytics'

initAuthListener()
initAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <AppRouter />
      <AnalyticsConsentBanner />
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--text-strong)',
            fontFamily: 'Instrument Sans, sans-serif',
          },
        }}
      />
    </MotionConfig>
  </StrictMode>,
)
