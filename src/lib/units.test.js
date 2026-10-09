import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultUnit, cleanUnit, formatQty } from './units.js'

test('parts start in pieces, everything else as a job', () => {
  assert.equal(defaultUnit('part'), 'pc')
  assert.equal(defaultUnit('labour'), 'job')
  assert.equal(defaultUnit('additional'), 'job')
})

test('a line saved before units prints the bare quantity', () => {
  assert.equal(formatQty(3, null), '3')
  assert.equal(formatQty('2.00', ''), '2')
})

test('quantity and unit print together', () => {
  assert.equal(formatQty('1.50', 'hrs'), '1.5 hrs')
  assert.equal(formatQty(4, ' L '), '4 L')
})

test('blank units are stored as null, long ones are cut', () => {
  assert.equal(cleanUnit('   '), null)
  assert.equal(cleanUnit(undefined), null)
  assert.equal(cleanUnit('x'.repeat(30)).length, 20)
})
