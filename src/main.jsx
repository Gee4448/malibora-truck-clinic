import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'

// Arm scroll-reveal before first paint. The reveal CSS only hides elements
// while `.reveal-ready` is on <html>, so if this bundle ever fails to run the
// content stays visible instead of being stuck at opacity:0.
document.documentElement.classList.add('reveal-ready')

// Register the service worker with auto-reload: when a new deploy activates,
// the page refreshes itself so users never sit on a stale cached build.
// Also re-check for updates hourly and whenever the app regains focus —
// long-lived PWA sessions otherwise never look for new versions.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    setInterval(() => registration.update(), 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) registration.update()
    })
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
