import { createClient } from '@supabase/supabase-js'
import { createSlotStore } from './accountSlots'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co'
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'

// How this page load happened: a reload keeps the tab's own account, a
// restored closed tab does not (see accountSlots.js).
const navType = (() => {
  try { return globalThis.performance?.getEntriesByType?.('navigation')?.[0]?.type || 'navigate' }
  catch { return 'navigate' }
})()

// One staff login per TAB, not per browser (see accountSlots.js). The slot
// has to be known before the client exists, because the storage key and the
// storage are fixed at creation; changing account means changing slot and
// reloading.
export const accountSlots = createSlotStore({
  projectRef: new URL(supabaseUrl).hostname.split('.')[0],
  navType,
  search: globalThis.location?.search || '',
})

const slot = accountSlots.currentSlot()

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: accountSlots.storageKeyFor(slot),
    storage: accountSlots.storageFor(slot),
  },
})

accountSlots.startTabClock()

// A tab opened to log someone in (Add another account, or the device account
// is locked) skips the staff access-code gate when a staff login already
// exists on this device: whoever is here has passed it before. Drop the
// "add-account" marker from the address so a reload does not start over.
if (accountSlots.isLanding() && accountSlots.deviceAccount()) {
  try {
    sessionStorage.setItem('malibora_staff_verified', 'true')
    sessionStorage.setItem('malibora_staff_verified_at', Date.now().toString())
  } catch { /* storage blocked: the gate will simply ask */ }
}
try {
  const url = new URL(globalThis.location.href)
  if (url.searchParams.has('add-account')) {
    url.searchParams.delete('add-account')
    globalThis.history.replaceState(globalThis.history.state, '', url.pathname + url.search + url.hash)
  }
} catch { /* not in a browser */ }

// Helper: Detect a connectivity failure (server unreachable / offline / paused project)
// vs. a real database error. Supabase/PostgREST errors carry a `code`; a bare fetch
// failure (DNS not resolving, offline, CORS, server down) does not.
export const isNetworkError = (err) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = (err?.message || String(err || '')).toLowerCase()
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|err_name_not_resolved|err_connection|err_network/.test(
    msg
  )
}

// Helper: Turn a Supabase/PostgREST error into something worth showing a user.
// Some Postgres errors (a missing function, a failed schema lookup) come back
// with an empty `message`, which used to render as a blank toast — the failure
// looked like nothing happening at all. Fall back through the other fields.
export const errorMessage = (err, fallback = 'Something went wrong. Please try again.') => {
  if (!err) return fallback
  const parts = [err.message, err.details, err.hint].map(s => (s || '').trim()).filter(Boolean)
  if (parts.length) return err.code ? `${parts[0]} (${err.code})` : parts[0]
  if (err.code) return `${fallback} (${err.code})`
  return fallback
}

// Helper: Format currency (TZS)
export const formatTZS = (amount) => {
  if (!amount && amount !== 0) return 'TZS 0'
  return `TZS ${Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

// Helper: Format date
export const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// Helper: Format datetime
export const formatDateTime = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
