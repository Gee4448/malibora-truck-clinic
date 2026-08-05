import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co'
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

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
