import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cannyRedirect } from '../server/utils/canny-redirect'

const CL = 'https://www.marketdata.app/changelog/'

test('feature post paths map to /p/<slug>', () => {
  assert.equal(cannyRedirect('/features/p/add-bond-quotes', undefined), '/p/add-bond-quotes')
  assert.equal(cannyRedirect('/features/p/add-bond-quotes/', undefined), '/p/add-bond-quotes')
})
test('/features maps to /', () => {
  assert.equal(cannyRedirect('/features', undefined), '/')
  assert.equal(cannyRedirect('/features/', undefined), '/')
})
test('changelog goes to the website when configured', () => {
  assert.equal(cannyRedirect('/changelog', CL), CL)
  assert.equal(cannyRedirect('/changelog/some-entry', CL), CL)
  assert.equal(cannyRedirect('/changelog', undefined), null)
})
test('native paths are untouched', () => {
  for (const p of ['/p/add-bond-quotes', '/', '/roadmap']) assert.equal(cannyRedirect(p, CL), null)
})
