// Several staff accounts open in one browser, one per tab (owner request
// 24 Sep 2026: "open the accounts of different staffs in one browser").
//
// supabase-js keeps the session under one localStorage key that every tab of
// the site shares, so a second login used to replace the first everywhere.
// Each tab now has a "slot" (in sessionStorage, which is per tab) and the
// Supabase client is created with a storage key and a storage that go with
// that slot.
//
// Two kinds of slot, and nothing in between:
//
//   ''  the DEVICE account. Kept in localStorage under the exact key
//       supabase-js used before, so every existing login survived the
//       deploy and phones stay signed in as always. It is the only account
//       a new tab can open.
//
//   any other: an ADDED account ("Add another account", which opens a new
//       tab). Kept in that tab's sessionStorage, so no other tab can see it,
//       open it or fall into it, and it goes when the tab goes.
//
// An earlier version shared added accounts between tabs and guessed which
// one a new tab should open; review found nine ways for that guess to put a
// receptionist into the owner's account or to lock the everyday user out.
// Now there is no guess.
//
// What remains to protect is the device account itself: on a reception PC
// where the owner logged in first, the receptionist's new tabs would be the
// owner. So once anyone signs in to an added account, the device account is
// LOCKED: a new tab opens on the login page, where the device account is
// offered behind its own password. Proving that password (or a fresh device
// login) unlocks it; so does the device account signing out.
//
// Switching this tab to the device account is one click only for an owner or
// manager going to their level or below (switchNeedsPassword); anyone else
// types the password.
//
// A closed tab brought back (Ctrl+Shift+T, session restore) has its old
// sessionStorage, so a tab only trusts its own slot on a reload or within
// seconds of last being seen; otherwise it starts again as a new tab and an
// added account in it is forgotten.
//
// Import-free on purpose, like billing.js, so it runs under `npm test` with
// fake storages.

const SLOT_KEY = 'malibora_staff_slot'        // sessionStorage: this tab's slot
const SEEN_KEY = 'malibora_staff_seen'        // sessionStorage: this tab last alive
const LANDING_KEY = 'malibora_staff_landing'  // sessionStorage: tab opened to log someone in
const OAUTH_KEY = 'malibora_staff_oauth'      // sessionStorage: Google round trip under way
const LOCK_KEY = 'malibora_staff_device_lock' // localStorage: device account needs its password
const SLOT_SEP = '--'

export const ADD_ACCOUNT_PARAM = 'add-account'
// A reload is recognised by the browser; anything else only keeps its slot
// if the tab was alive this recently.
export const RESTORE_MS = 10 * 1000
export const OAUTH_MS = 10 * 60 * 1000
const SEEN_EVERY_MS = 3 * 1000

// Keys left by the version that shared added accounts between tabs.
const LEGACY_PREFIXES = ['malibora_staff_alive--', 'malibora_staff_role--']
const LEGACY_KEYS = ['malibora_staff_last_slot']

// Only owner and manager carry powers the rest do not (costs, reports, staff
// admin), so every other role ranks the same.
const ELEVATED = { owner: 3, manager: 2 }
const rankOf = (role) => (role ? (ELEVATED[role] ?? 1) : 0)

// currentRole: this tab's role, or null when nobody is signed in here.
// targetRole: the other account's role, or null when it could not be read —
// assumed to be the highest, so an unreadable role never opens a door.
export function switchNeedsPassword(currentRole, targetRole) {
  const mine = rankOf(currentRole)
  const theirs = targetRole ? rankOf(targetRole) : ELEVATED.owner
  return !(mine >= ELEVATED.manager && mine >= theirs)
}

const memoryStorage = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size },
  }
}

// Storage can throw on read (blocked site data) or on write (private mode,
// quota). This runs while the app is still booting, so a throw would blank
// the whole screen; every call is guarded and a failure reads as "nothing
// stored".
const guarded = (get) => {
  const probe = () => { const s = get() || null; if (s) s.getItem('__probe__'); return s }
  let t
  try { t = probe() } catch { t = null }
  t = t || memoryStorage()
  const attempt = (fn, fallback) => { try { return fn() } catch { return fallback } }
  return {
    getItem: (k) => attempt(() => t.getItem(k), null),
    setItem: (k, v) => attempt(() => t.setItem(k, v), undefined),
    removeItem: (k) => attempt(() => t.removeItem(k), undefined),
    key: (i) => attempt(() => t.key(i), null),
    get length() { return attempt(() => t.length, 0) },
  }
}

const randomId = () => {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().slice(0, 8)
  } catch { /* fall through */ }
  return Math.random().toString(36).slice(2, 10)
}

// projectRef is what supabase-js puts in its default key: the first label of
// the project hostname ("sb-<ref>-auth-token").
//   navType: how this page load happened ('reload', 'navigate', ...).
//   search:  location.search at boot.
export function createSlotStore({
  projectRef, session, local, navigate, openTab, newId, now, navType = 'navigate', search = '',
} = {}) {
  const ss = guarded(() => session || globalThis.sessionStorage)
  const ls = guarded(() => local || globalThis.localStorage)
  const go = navigate || ((path) => { globalThis.location.assign(path) })
  const open = openTab || ((path) => { globalThis.open(path, '_blank', 'noopener') })
  const makeId = newId || randomId
  const clock = now || (() => Date.now())
  const baseKey = `sb-${projectRef}-auth-token`

  const storageKeyFor = (slot) => (slot ? `${baseKey}${SLOT_SEP}${slot}` : baseKey)
  // Where that slot's session lives: shared for the device, this tab only
  // for an added account.
  const storageFor = (slot) => (slot ? ss : ls)

  const deviceAccount = () => {
    try {
      const s = JSON.parse(ls.getItem(baseKey))
      if (!s?.user?.id) return null
      const meta = s.user.user_metadata || {}
      return {
        slot: '',
        userId: s.user.id,
        email: s.user.email || '',
        name: meta.full_name || meta.name || '',
      }
    } catch { return null }
  }

  const isLocked = () => ls.getItem(LOCK_KEY) === '1'
  const lock = () => ls.setItem(LOCK_KEY, '1')
  const unlock = () => ls.removeItem(LOCK_KEY)

  const markSeen = () => ss.setItem(SEEN_KEY, String(clock()))

  // Keys the earlier version left in localStorage. Its added-account logins
  // were stored there too; they are dropped, so those users sign in again.
  const migrateLegacy = () => {
    const doomed = []
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i) || ''
      if (key.startsWith(`${baseKey}${SLOT_SEP}`)) doomed.push(key)
      else if (LEGACY_PREFIXES.some(p => key.startsWith(p))) doomed.push(key)
      else if (LEGACY_KEYS.includes(key)) doomed.push(key)
    }
    doomed.forEach(k => ls.removeItem(k))
  }

  let resolved = null
  let backFromOAuth = false

  // The slot this tab lives in, decided once per page load.
  const currentSlot = () => {
    if (resolved !== null) return resolved
    migrateLegacy()

    const own = ss.getItem(SLOT_KEY)
    const seen = Number(ss.getItem(SEEN_KEY)) || 0
    const oauth = Number(ss.getItem(OAUTH_KEY)) || 0
    ss.removeItem(OAUTH_KEY)
    backFromOAuth = oauth > 0 && clock() - oauth < OAUTH_MS
    // "Add another account" always starts a fresh login, even if it arrives
    // in this same tab (a browser or installed app that will not open a new
    // one): the device account stays stored, this tab just moves off it.
    const adding = new URLSearchParams(search).has(ADD_ACCOUNT_PARAM)
    const trusted = !adding && own !== null && (
      navType === 'reload'
      || clock() - seen < RESTORE_MS
      || backFromOAuth // back from Google, however long it took
    )

    if (trusted) {
      resolved = own
    } else {
      // A new tab, or a closed one brought back. An added account in it is
      // forgotten: it belonged to whoever closed that tab.
      if (own) ss.removeItem(storageKeyFor(own))
      ss.removeItem(LANDING_KEY)
      if (adding || (isLocked() && deviceAccount())) {
        resolved = makeId()
        ss.setItem(LANDING_KEY, '1')
      } else {
        resolved = ''
      }
      ss.setItem(SLOT_KEY, resolved)
    }
    markSeen()
    return resolved
  }

  const isDeviceTab = () => currentSlot() === ''
  // This tab was opened to log someone in (Add another account, or the
  // device account is locked). The staff gate need not be passed again when
  // a staff login already exists on this device.
  const isLanding = () => ss.getItem(LANDING_KEY) === '1'

  // Keep the "last seen" stamp fresh so a reload keeps its slot and a tab
  // restored long after it was closed does not.
  const startTabClock = () => {
    currentSlot()
    markSeen()
    const timer = globalThis.setInterval?.(markSeen, SEEN_EVERY_MS)
    const onHide = () => markSeen()
    globalThis.addEventListener?.('pagehide', onHide)
    globalThis.document?.addEventListener?.('visibilitychange', onHide)
    return () => {
      if (timer) globalThis.clearInterval(timer)
      globalThis.removeEventListener?.('pagehide', onHide)
      globalThis.document?.removeEventListener?.('visibilitychange', onHide)
    }
  }

  // Someone signed in on this tab. An added account locks the device
  // account; a real device login unlocks it — a password typed here, or a
  // Google round trip this tab started — but not a session merely recovered
  // on page load or tab focus, which supabase-js also reports as a sign-in.
  const signedIn = ({ fresh = false } = {}) => {
    if (!isDeviceTab()) lock()
    else if (fresh || backFromOAuth) unlock()
  }
  // The device account signed out: nothing left to protect.
  const signedOut = () => { if (isDeviceTab()) unlock() }

  // Mark a Google round trip so the tab keeps its slot when it comes back.
  const oauthStarted = () => ss.setItem(OAUTH_KEY, String(clock()))

  // Move this tab onto the device account. Callers have already checked the
  // password, or that this tab outranks it; either way it is unlocked.
  const switchToDevice = (path = '/admin') => {
    ss.setItem(SLOT_KEY, '')
    ss.removeItem(LANDING_KEY)
    unlock()
    markSeen()
    go(path)
  }

  // A new tab with a fresh slot on the login page. This tab stays as it is.
  const addAccount = () => open(`/admin/login?${ADD_ACCOUNT_PARAM}=1`)

  return {
    storageKeyFor, storageFor, deviceAccount, currentSlot, isDeviceTab, isLanding, isLocked,
    startTabClock, signedIn, signedOut, oauthStarted, switchToDevice, addAccount,
  }
}
