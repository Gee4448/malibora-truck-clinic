// Run with: npm test
//
// One browser, several staff logged in, one per tab. These drive the REAL
// createSlotStore with fake storages: one localStorage shared by the whole
// "browser" and one sessionStorage per "tab", so the multi-tab stories below
// run against the shipped logic, not a re-typed copy of it.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createSlotStore, switchNeedsPassword, RESTORE_MS, OAUTH_MS } from './accountSlots.js'

const fakeStorage = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size },
    dump: () => Object.fromEntries(m),
  }
}

const REF = 'tdvimpqiupasfpebijap'
const BASE = `sb-${REF}-auth-token`
const T0 = 1_800_000_000_000

const session = (id, email, name) => JSON.stringify({
  access_token: 'a', refresh_token: 'r', expires_at: 1,
  user: { id, email, user_metadata: { full_name: name } },
})

// A browser: shared localStorage, a clock, and tabs that each have their own
// sessionStorage. tab.load() is one page load (new tab, reload, restore).
const browser = () => {
  const local = fakeStorage()
  const clock = { t: T0 }
  let n = 0
  const tab = (sess = fakeStorage()) => {
    const t = { sess, visited: [], opened: [] }
    t.load = ({ navType = 'navigate', search = '' } = {}) => {
      t.store = createSlotStore({
        projectRef: REF, session: sess, local,
        navigate: (p) => t.visited.push(p),
        openTab: (p) => t.opened.push(p),
        newId: () => `s${++n}`,
        now: () => clock.t,
        navType, search,
      })
      t.slot = t.store.currentSlot()
      return t
    }
    // Sign someone in on this tab the way supabase-js would store it.
    t.login = (id, name, { fresh = true } = {}) => {
      t.store.storageFor(t.slot).setItem(t.store.storageKeyFor(t.slot), session(id, `${name.toLowerCase()}@staff.malibora.co.tz`, name))
      t.store.signedIn({ fresh })
      return t
    }
    // Chrome's "reopen closed tab" brings sessionStorage back as it was.
    t.restoreClosed = () => tab(sess)
    return t
  }
  return { local, clock, tab, later: (ms) => { clock.t += ms } }
}

test('slot "" is exactly the key supabase-js uses on its own, in localStorage, so old logins survive', () => {
  const b = browser()
  const t = b.tab().load().login('u1', 'Antony')
  assert.equal(t.slot, '')
  assert.ok(b.local.getItem(BASE))
  assert.equal(t.sess.getItem(BASE), null)
})

test('a one-account phone: nothing changes, every new tab is the device account', () => {
  const b = browser()
  b.tab().load().login('u1', 'Asha')
  b.later(60 * 60 * 1000)
  assert.equal(b.tab().load().slot, '')
  assert.equal(b.tab().load().slot, '')
})

test('an added account lives only in its own tab and never in localStorage', () => {
  const b = browser()
  const owner = b.tab().load().login('u1', 'Antony')
  owner.store.addAccount()
  assert.deepEqual(owner.opened, ['/admin/login?add-account=1'])

  const added = b.tab().load({ search: '?add-account=1' })
  assert.notEqual(added.slot, '')
  assert.equal(added.store.isLanding(), true)
  added.login('u2', 'Asha')

  assert.ok(added.sess.getItem(`${BASE}--${added.slot}`))
  assert.equal(Object.keys(b.local.dump()).filter(k => k.startsWith(`${BASE}--`)).length, 0)
  // The owner's own tab is untouched.
  assert.equal(owner.store.currentSlot(), '')
})

test('"Add another account" that lands in the SAME tab still starts a fresh login and keeps the device account stored', () => {
  const b = browser()
  const t = b.tab().load().login('u1', 'Antony')
  const same = t.restoreClosed().load({ search: '?add-account=1' }) // same sessionStorage, seconds later
  assert.notEqual(same.slot, '')
  assert.equal(same.store.isLanding(), true)
  assert.ok(b.local.getItem(BASE))
})

test('THE reviewed hole: owner first on the reception PC, receptionist added; her new tabs never open the owner', () => {
  const b = browser()
  b.tab().load().login('u1', 'Antony')                        // owner is the device account
  const asha = b.tab().load({ search: '?add-account=1' }).login('u2', 'Asha')
  assert.equal(asha.store.isLocked(), true)

  // New tab, at once or much later, window or PWA: a login page, not the owner.
  const t1 = b.tab().load()
  assert.notEqual(t1.slot, '')
  assert.equal(t1.store.isLanding(), true)
  b.later(60 * 60 * 1000)
  assert.notEqual(b.tab().load().slot, '')
})

test('closing and restoring tabs never brings an added account back', () => {
  const b = browser()
  b.tab().load().login('u2', 'Asha')                          // receptionist is the device account
  const visit = b.tab().load({ search: '?add-account=1' }).login('u1', 'Antony')
  const visitKey = `${BASE}--${visit.slot}`

  // The owner closes his tab; the receptionist reopens it a minute later.
  b.later(60 * 1000)
  const restored = visit.restoreClosed().load({ navType: 'back_forward' })
  assert.notEqual(restored.slot, visit.slot)
  assert.equal(restored.sess.getItem(visitKey), null)         // his login is gone
})

test('a reload keeps the tab\'s own account, however long it takes', () => {
  const b = browser()
  const added = b.tab().load({ search: '?add-account=1' }).login('u2', 'Asha')
  b.later(5 * 60 * 1000)
  const again = added.restoreClosed().load({ navType: 'reload' })
  assert.equal(again.slot, added.slot)
  assert.ok(again.sess.getItem(`${BASE}--${added.slot}`))
})

test('a non-reload load within seconds keeps the slot; later it does not', () => {
  const b = browser()
  const added = b.tab().load({ search: '?add-account=1' }).login('u2', 'Asha')
  b.later(RESTORE_MS - 1)
  assert.equal(added.restoreClosed().load().slot, added.slot)
  b.later(RESTORE_MS + 1)
  assert.notEqual(added.restoreClosed().load().slot, added.slot)
})

test('coming back from Google keeps the slot even after minutes at the chooser, once', () => {
  const b = browser()
  const added = b.tab().load({ search: '?add-account=1' })
  added.store.oauthStarted()
  b.later(4 * 60 * 1000)
  const back = added.restoreClosed().load()
  assert.equal(back.slot, added.slot)

  // The mark is used once: a later restore of the same tab is a new tab.
  b.later(RESTORE_MS + 1)
  assert.notEqual(back.restoreClosed().load().slot, added.slot)

  const stale = b.tab().load({ search: '?add-account=1' })
  stale.store.oauthStarted()
  b.later(OAUTH_MS + 1)
  assert.notEqual(stale.restoreClosed().load().slot, stale.slot)
})

test('the everyday user is never stranded: after a visit, her password unlocks her new tabs', () => {
  const b = browser()
  b.tab().load().login('u2', 'Asha')                          // her PC
  b.tab().load({ search: '?add-account=1' }).login('u1', 'Antony') // owner visits
  const next = b.tab().load()
  assert.notEqual(next.slot, '')                              // locked: login page...
  assert.equal(next.store.isLanding(), true)                  // ...with no staff gate
  assert.deepEqual(next.store.deviceAccount(), {
    slot: '', userId: 'u2', email: 'asha@staff.malibora.co.tz', name: 'Asha',
  })
  next.store.switchToDevice()                                 // after her password
  assert.deepEqual(next.visited, ['/admin'])
  assert.equal(next.store.isLocked(), false)
  assert.equal(b.tab().load().slot, '')                       // back to normal
})

test('a recovered session on the device tab does not unlock; a fresh device login does', () => {
  const b = browser()
  const dev = b.tab().load().login('u1', 'Antony')
  b.tab().load({ search: '?add-account=1' }).login('u2', 'Asha')
  dev.store.signedIn()                                        // his tab regains focus
  assert.equal(dev.store.isLocked(), true)
  dev.store.signedIn({ fresh: true })                         // he typed his password
  assert.equal(dev.store.isLocked(), false)
})

test('Google on the device tab unlocks only when the round trip was started in that tab', () => {
  const b = browser()
  const dev = b.tab().load().login('u1', 'Antony')
  b.tab().load({ search: '?add-account=1' }).login('u2', 'Asha')
  dev.store.oauthStarted()                                    // re-login with Google from his own tab
  b.later(30 * 1000)
  const back = dev.restoreClosed().load()
  assert.equal(back.slot, '')
  back.store.signedIn()                                       // the SIGNED_IN from the URL
  assert.equal(back.store.isLocked(), false)
})

test('the device account signing out lifts the lock (nothing left to protect)', () => {
  const b = browser()
  const dev = b.tab().load().login('u1', 'Antony')
  b.tab().load({ search: '?add-account=1' }).login('u2', 'Asha')
  dev.store.signedOut()
  assert.equal(dev.store.isLocked(), false)
})

test('an added tab signing out does not unlock the device', () => {
  const b = browser()
  b.tab().load().login('u1', 'Antony')
  const added = b.tab().load({ search: '?add-account=1' }).login('u2', 'Asha')
  added.store.signedOut()
  assert.equal(added.store.isLocked(), true)
})

test('no device login at all: nothing is locked away, new tabs are plain', () => {
  const b = browser()
  b.tab().load({ search: '?add-account=1' }).login('u2', 'Asha')
  assert.equal(b.tab().load().slot, '')                       // no device session to protect
})

test('logins left in localStorage by the earlier version are cleared on first load', () => {
  const b = browser()
  b.local.setItem(BASE, session('u1', 'antony@x', 'Antony'))
  b.local.setItem(`${BASE}--old1`, session('u2', 'asha@x', 'Asha'))
  b.local.setItem(`${BASE}--old1-code-verifier`, 'pkce')
  b.local.setItem('malibora_staff_alive--old1', '1')
  b.local.setItem('malibora_staff_role--old1', 'receptionist')
  b.local.setItem('malibora_staff_role--', 'owner')
  b.local.setItem('malibora_staff_last_slot', 'old1')
  b.local.setItem('malibora_lang', 'sw')
  b.tab().load()
  assert.deepEqual(Object.keys(b.local.dump()).sort(), [BASE, 'malibora_lang'].sort())
})

test('switching: one click only for owner/manager going to their level or below', () => {
  const cases = [
    // [this tab, target, needs password?]
    ['owner', 'owner', false],
    ['owner', 'manager', false],
    ['owner', 'receptionist', false],
    ['manager', 'manager', false],
    ['manager', 'mechanic', false],
    ['manager', 'owner', true],
    ['receptionist', 'owner', true],
    ['receptionist', 'manager', true],
    ['receptionist', 'secretary', true],
    ['accountant', 'receptionist', true],
    [null, 'receptionist', true],        // the login page: nobody signed in
    [null, 'owner', true],
    ['owner', null, false],              // role unreadable: owner may still go
    ['manager', null, true],             // ...but it counts as an owner for anyone else
    ['receptionist', null, true],
  ]
  for (const [mine, theirs, want] of cases) {
    assert.equal(switchNeedsPassword(mine, theirs), want, `${mine} -> ${theirs}`)
  }
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
  assert.equal(store.deviceAccount(), null)
  assert.doesNotThrow(() => store.signedIn({ fresh: true }))
  assert.doesNotThrow(() => store.startTabClock()())
})
