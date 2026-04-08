import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import './index.css'
import AppRouter from './router'
import { initAuthListener } from './lib/auth'

initAuthListener()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRouter />
    <Toaster
      theme="dark"
      position="top-center"
      toastOptions={{
        style: {
          background: '#1F1D3B',
          border: '1px solid rgba(128,140,179,0.18)',
          color: '#ffffff',
          fontFamily: 'Urbanist, sans-serif',
        },
      }}
    />
  </StrictMode>,
)
