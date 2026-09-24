// Several staff accounts open in one browser, one per tab (owner request
// 24 Sep 2026: "open the accounts of different staffs in one browser").
//
// supabase-js keeps the session in localStorage under one key, and every tab
// of the site shares localStorage, so logging in on a second tab used to
// replace the first tab's login. The fix is a "slot": each tab remembers in
// sessionStorage (which is per tab) which slot it belongs to, and the Supabase
// client is created with a storage key that carries that slot. Tabs on the
// same slot share one session and refresh it together, exactly as before;
// tabs on different slots never see each other.
//
// Slot '' is the plain key supabase-js would have used on its own, so every
// login that existed before this shipped keeps working. It is the device's
// own account: it stays signed in for as long as it always has.
//
// Every other slot is a visitor. It counts only while a tab with it is open:
// tabs write a heartbeat, and a slot whose heartbeat has gone quiet is neither
// offered in the switcher nor joined by a new tab, and its stored login is
// removed. So the owner who checks something as himself on the reception
// computer and closes the tab leaves nothing behind for the next person to
// click into.
//
// Import-free on purpose, like billing.js, so it runs under `npm test` with
// fake storages.

const SLOT_KEY = 'malibora_staff_slot'          // sessionStorage: this tab's slot
const LAST_SLOT_KEY = 'malibora_staff_last_slot' // localStorage: what a new tab joins
const ALIVE_PREFIX = 'malibora_staff_alive--'    // localStorage: last heartbeat per slot
const SLOT_SEP = '--'

export const HEARTBEAT_MS = 30 * 1000
// Wide enough that a phone throttling a background tab's timers does not make
// a live account look dead.
export const LIVE_MS = 3 * 60 * 1000

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
// quota). currentSlot() runs while the app is still booting, so a throw
// there would blank the whole screen; every call is guarded and a failure
// simply reads as "nothing stored".
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
export function createSlotStore({ projectRef, session, local, navigate, newId, now } = {}) {
  const ss = guarded(() => session || globalThis.sessionStorage)
  const ls = guarded(() => local || globalThis.localStorage)
  const go = navigate || ((path) => { globalThis.location.assign(path) })
  const makeId = newId || randomId
  const clock = now || (() => Date.now())
  const baseKey = `sb-${projectRef}-auth-token`

  const storageKeyFor = (slot) => (slot ? `${baseKey}${SLOT_SEP}${slot}` : baseKey)

  const parseSession = (slot) => {
    try {
      const s = JSON.parse(ls.getItem(storageKeyFor(slot)))
      return s?.user?.id ? s : null
    } catch { return null }
  }

  const lastBeat = (slot) => Number(ls.getItem(ALIVE_PREFIX + slot)) || 0
  // The device's own slot is always live; a visitor slot needs a recent beat.
  const isAlive = (slot) => slot === '' || clock() - lastBeat(slot) < LIVE_MS
  const touch = (slot) => { if (slot !== '') ls.setItem(ALIVE_PREFIX + slot, String(clock())) }

  // Forget visitor slots nobody has open any more: the session, the PKCE
  // side file supabase-js keeps next to it, and the heartbeat itself.
  const dropSlot = (slot) => {
    ls.removeItem(storageKeyFor(slot))
    ls.removeItem(`${storageKeyFor(slot)}-code-verifier`)
    ls.removeItem(ALIVE_PREFIX + slot)
  }
  const slotOfKey = (key) => {
    if (!key.startsWith(baseKey)) return null
    const rest = key.slice(baseKey.length)
    if (rest === '') return ''
    // "-code-verifier" and anything else supabase-js hangs off the key
    if (!rest.startsWith(SLOT_SEP) || rest.includes('-', SLOT_SEP.length)) return null
    return rest.slice(SLOT_SEP.length)
  }
  const pruneStale = () => {
    const stale = []
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i) || ''
      let slot = slotOfKey(key)
      if (slot === null && key.startsWith(ALIVE_PREFIX)) slot = key.slice(ALIVE_PREFIX.length)
      if (slot && !isAlive(slot) && !stale.includes(slot)) stale.push(slot)
    }
    stale.forEach(dropSlot)
    return stale
  }

  // The slot this tab lives in. A tab that has none yet joins the slot used
  // most recently on this browser — if that account is still open somewhere;
  // otherwise the device's own account, so a stale default cannot strand
  // anyone on a login page — and keeps it from then on.
  const currentSlot = () => {
    const own = ss.getItem(SLOT_KEY)
    if (own !== null) return own
    let slot = ls.getItem(LAST_SLOT_KEY) || ''
    if (slot !== '' && !(isAlive(slot) && parseSession(slot))) slot = ''
    ss.setItem(SLOT_KEY, slot)
    return slot
  }

  const rememberAsDefault = (slot = currentSlot()) => { ls.setItem(LAST_SLOT_KEY, slot) }

  // Keep this tab's slot counted as open. Call once the client exists; it
  // also clears out whatever earlier tabs left behind.
  const startHeartbeat = () => {
    const slot = currentSlot()
    touch(slot)
    pruneStale()
    const beat = () => touch(slot)
    const timer = globalThis.setInterval?.(beat, HEARTBEAT_MS)
    const onVisible = () => { if (globalThis.document?.visibilityState === 'visible') beat() }
    globalThis.document?.addEventListener?.('visibilitychange', onVisible)
    return () => {
      if (timer) globalThis.clearInterval(timer)
      globalThis.document?.removeEventListener?.('visibilitychange', onVisible)
    }
  }

  // Every account open on this browser: the device's own (if signed in) and
  // each visitor slot some tab still has open. Read straight from what
  // supabase-js writes; a broken entry is skipped rather than allowed to
  // break the menu.
  const listAccounts = () => {
    pruneStale()
    const out = []
    for (let i = 0; i < ls.length; i++) {
      const slot = slotOfKey(ls.key(i) || '')
      if (slot === null || !isAlive(slot)) continue
      const s = parseSession(slot)
      if (!s) continue
      const meta = s.user.user_metadata || {}
      out.push({
        slot,
        userId: s.user.id,
        email: s.user.email || '',
        name: meta.full_name || meta.name || '',
      })
    }
    return out
  }

  // Take this tab to another account's slot.
  const switchTo = (slot, path = '/admin') => {
    ss.setItem(SLOT_KEY, slot)
    touch(slot)
    rememberAsDefault(slot)
    go(path)
  }

  // A fresh slot with no session: the login page, without touching any other
  // tab's login. Not made the default — nothing is signed in there yet; the
  // login itself does that. Returns the slot so a caller can label it.
  const addAccount = (path = '/admin/login') => {
    const slot = makeId()
    ss.setItem(SLOT_KEY, slot)
    touch(slot)
    go(path)
    return slot
  }

  return {
    storageKeyFor, currentSlot, rememberAsDefault, startHeartbeat,
    listAccounts, pruneStale, switchTo, addAccount,
  }
}
