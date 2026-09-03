// Run with: npm test
//
// Imports the REAL src/lib/scrollChrome.js, for the reason billing.test.js
// gives: a suite that re-types the function proves the arithmetic, not that the
// shipped code contains it.

import test from 'node:test'
import assert from 'node:assert/strict'
import { scrollChromeState, SCROLL_THRESHOLD } from './scrollChrome.js'

test('a page shorter than the viewport never reports progress', () => {
  // The whole point of the span check: without it this divides by a negative
  // number and the progress line draws backwards off a short screen.
  const s = scrollChromeState(0, 600, 900)
  assert.equal(s.progress, 0)
  assert.equal(s.scrolled, false)
})

test('a page exactly the height of the viewport does not scroll', () => {
  assert.equal(scrollChromeState(0, 900, 900).progress, 0)
})

test('progress is the fraction of the scrollable span, not of the document', () => {
  // 2000px of document in a 1000px window scrolls 1000px, so 500px in is half
  // way — not a quarter, which is what dividing by scrollHeight would give.
  assert.equal(scrollChromeState(500, 2000, 1000).progress, 0.5)
  assert.equal(scrollChromeState(1000, 2000, 1000).progress, 1)
})

test('overscroll cannot push progress outside 0..1', () => {
  // iOS rubber-band reports a negative offset at the top and an offset past the
  // span at the bottom. Unclamped, the first draws a negative width and the
  // second a line wider than the header.
  assert.equal(scrollChromeState(-120, 2000, 1000).progress, 0)
  assert.equal(scrollChromeState(1400, 2000, 1000).progress, 1)
})

test('the bar condenses only past the threshold', () => {
  assert.equal(scrollChromeState(SCROLL_THRESHOLD, 2000, 1000).scrolled, false)
  assert.equal(scrollChromeState(SCROLL_THRESHOLD + 1, 2000, 1000).scrolled, true)
})

test('a negative offset at the top leaves the bar at rest', () => {
  assert.equal(scrollChromeState(-40, 2000, 1000).scrolled, false)
})
