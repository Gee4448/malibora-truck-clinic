// Run with: npm test
//
// One browser, several staff logged in, one per tab. These drive the REAL
// createSlotStore with fake storages so they prove the shipped logic, not a
// re-typed copy of it.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createSlotStore, LIVE_MS } from './accountSlots.js'

const fakeStorage = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size },
  }
}

const REF = 'tdvimpqiupasfpebijap'
const BASE = `sb-${REF}-auth-token`
const T0 = 1_800_000_000_000

const session = (id, email, name) => JSON.stringify({
  access_token: 'a', refresh_token: 'r', expires_at: 1,
  user: { id, email, user_metadata: { full_name: name } },
})

const build = ({ local = fakeStorage(), sess = fakeStorage(), ids = ['s1', 's2'] } = {}) => {
  const visited = []
  const clock = { t: T0 }
  const store = createSlotStore({
    projectRef: REF, session: sess, local,
    navigate: (p) => visited.push(p),
    newId: () => ids.shift(),
    now: () => clock.t,
  })
  return { store, local, sess, visited, clock }
}

// A visitor slot some tab has open right now.
const openVisitor = (local, slot, id, name, at = T0) => {
  local.setItem(`${BASE}--${slot}`, session(id, `${name.toLowerCase()}@staff.malibora.co.tz`, name))
  local.setItem(`malibora_staff_alive--${slot}`, String(at))
}

test('slot "" is exactly the key supabase-js uses on its own, so old logins survive', () => {
  const { store } = build()
  assert.equal(store.storageKeyFor(''), BASE)
  assert.equal(store.storageKeyFor('s1'), `${BASE}--s1`)
})

test('a brand-new browser lands on slot "" and remembers it in the tab', () => {
  const { store, sess } = build()
  assert.equal(store.currentSlot(), '')
  assert.equal(sess.getItem('malibora_staff_slot'), '')
})

test('a new tab joins the most recent slot only while that account is open somewhere', () => {
  const local = fakeStorage()
  local.setItem('malibora_staff_last_slot', 's1')
  openVisitor(local, 's1', 'u2', 'Asha')
  assert.equal(build({ local }).store.currentSlot(), 's1')

  // Its last tab closed a while ago: fall back to the device's own account.
  const gone = build({ local })
  gone.clock.t = T0 + LIVE_MS + 1
  assert.equal(gone.store.currentSlot(), '')

  // A default pointing at a slot with no login at all is ignored too.
  const empty = fakeStorage()
  empty.setItem('malibora_staff_last_slot', 's9')
  empty.setItem('malibora_staff_alive--s9', String(T0))
  assert.equal(build({ local: empty }).store.currentSlot(), '')
})

test('an existing tab keeps its own slot whatever the default says', () => {
  const local = fakeStorage()
  local.setItem('malibora_staff_last_slot', 's1')
  const { store, sess } = build({ local })
  sess.setItem('malibora_staff_slot', '')
  assert.equal(store.currentSlot(), '')
})

test('adding an account moves only this tab to a fresh slot, opens login, and is NOT the default yet', () => {
  const { store, sess, local, visited } = build()
  store.currentSlot()
  const slot = store.addAccount()
  assert.equal(slot, 's1')
  assert.equal(sess.getItem('malibora_staff_slot'), 's1')
  assert.equal(local.getItem('malibora_staff_last_slot'), null)
  assert.deepEqual(visited, ['/admin/login'])
})

test('a login makes this tab\'s slot the default for new tabs', () => {
  const { store, local } = build()
  store.addAccount()
  store.rememberAsDefault()
  assert.equal(local.getItem('malibora_staff_last_slot'), 's1')
})

test('switching goes to that slot and makes it the default', () => {
  const { store, sess, local, visited } = build()
  store.switchTo('s2')
  assert.equal(sess.getItem('malibora_staff_slot'), 's2')
  assert.equal(local.getItem('malibora_staff_last_slot'), 's2')
  assert.deepEqual(visited, ['/admin'])
})

test('listAccounts: the device account plus visitor slots with a live heartbeat, nothing else', () => {
  const local = fakeStorage()
  local.setItem(BASE, session('u1', 'antony@staff.malibora.co.tz', 'Antony'))
  openVisitor(local, 's1', 'u2', 'Asha')
  openVisitor(local, 's3', 'u3', 'Juma', T0 - LIVE_MS - 1)        // tab closed long ago
  local.setItem(`${BASE}--s4`, session('u4', 'x@y', 'Nobody'))     // no heartbeat at all
  local.setItem(`${BASE}-code-verifier`, 'pkce-junk')              // supabase-js side file
  local.setItem(`${BASE}--s1-code-verifier`, 'pkce-junk')          // same, on a slot
  local.setItem(`${BASE}--bad`, '{not json')                       // corrupt
  local.setItem('malibora_staff_alive--bad', String(T0))
  local.setItem(`${BASE}--empty`, JSON.stringify({ user: null }))  // signed-out remnant
  local.setItem('malibora_staff_alive--empty', String(T0))
  local.setItem('malibora_lang', 'sw')                             // unrelated
  const { store } = build({ local })

  const got = store.listAccounts().sort((a, b) => a.slot.localeCompare(b.slot))
  assert.deepEqual(got, [
    { slot: '', userId: 'u1', email: 'antony@staff.malibora.co.tz', name: 'Antony' },
    { slot: 's1', userId: 'u2', email: 'asha@staff.malibora.co.tz', name: 'Asha' },
  ])
})

test('a visitor slot whose tabs are all closed is wiped: session, PKCE file and heartbeat', () => {
  const local = fakeStorage()
  local.setItem(BASE, session('u1', 'antony@staff.malibora.co.tz', 'Antony'))
  openVisitor(local, 's1', 'u2', 'Asha')
  local.setItem(`${BASE}--s1-code-verifier`, 'pkce')
  const { store, clock } = build({ local })

  clock.t = T0 + LIVE_MS + 1
  assert.deepEqual(store.pruneStale(), ['s1'])
  assert.equal(local.getItem(`${BASE}--s1`), null)
  assert.equal(local.getItem(`${BASE}--s1-code-verifier`), null)
  assert.equal(local.getItem('malibora_staff_alive--s1'), null)
  // The device's own login is never touched.
  assert.ok(local.getItem(BASE))
})

test('the heartbeat keeps this tab\'s visitor slot alive and never marks the device slot', () => {
  const { store, local, clock } = build()
  store.addAccount()
  clock.t = T0 + 10
  const stop = store.startHeartbeat()
  stop()
  assert.equal(local.getItem('malibora_staff_alive--s1'), String(T0 + 10))

  const dev = build()
  dev.store.currentSlot()
  dev.store.startHeartbeat()()
  assert.equal(dev.local.getItem('malibora_staff_alive--'), null)
})

test('storage that throws on read or write degrades to "nothing stored" instead of crashing', () => {
  const throwing = {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('quota') },
    removeItem() { throw new Error('blocked') },
    key() { throw new Error('blocked') },
    get length() { throw new Error('blocked') },
  }
  const store = createSlotStore({ projectRef: REF, session: throwing, local: throwing, navigate: () => {} })
  assert.equal(store.currentSlot(), '')
  assert.deepEqual(store.listAccounts(), [])
  assert.doesNotThrow(() => store.rememberAsDefault())

  // Readable but write-refusing storage (older private modes) is the same.
  const readOnly = Object.assign(fakeStorage(), { setItem() { throw new Error('quota') } })
  const ro = createSlotStore({ projectRef: REF, session: readOnly, local: readOnly, navigate: () => {} })
  assert.equal(ro.currentSlot(), '')
  assert.doesNotThrow(() => ro.startHeartbeat()())
})
