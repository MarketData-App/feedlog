import { strict as assert } from 'node:assert'
import { test } from 'node:test'

const { shouldReloadOnUserChange, patchViewerFields } = await import('../app/utils/session-refresh')

const alice = { id: 'a', isAnonymous: false }
const bob = { id: 'b', isAnonymous: false }
const guest = { id: 'g', isAnonymous: true }

// ── auth-reload: reload only when another account's data could be on screen ──

test('shouldReloadOnUserChange: a first sign-in (nobody → account) refreshes in place', () => {
  assert.equal(shouldReloadOnUserChange(null, alice), false)
})

test('shouldReloadOnUserChange: a guest becoming an account refreshes in place', () => {
  assert.equal(shouldReloadOnUserChange(guest, alice), false)
})

test('shouldReloadOnUserChange: one account replaced by another reloads', () => {
  assert.equal(shouldReloadOnUserChange(alice, bob), true)
  assert.equal(shouldReloadOnUserChange(alice, guest), true)
})

test('shouldReloadOnUserChange: the same account, a sign-out, or a first guest does not reload', () => {
  assert.equal(shouldReloadOnUserChange(alice, { id: 'a', isAnonymous: false }), false)
  assert.equal(shouldReloadOnUserChange(alice, null), false)
  assert.equal(shouldReloadOnUserChange(null, guest), false)
  assert.equal(shouldReloadOnUserChange(null, null), false)
})

// ── Per-viewer fields patched onto what is already on screen ───────────────

test('patchViewerFields: copies only the named fields, by id, in place', () => {
  const shown = [
    { id: '1', title: 'One', hasVoted: false, voteCount: 3 },
    { id: '2', title: 'Two', hasVoted: false, voteCount: 5 },
  ]
  const first = shown[0]
  patchViewerFields(shown, [
    { id: '2', title: 'Changed', hasVoted: true, voteCount: 6 },
    { id: '1', title: 'Changed', hasVoted: false, voteCount: 3 },
  ], ['hasVoted', 'voteCount'])
  assert.equal(shown[0], first, 'same objects, so the DOM is kept')
  assert.deepEqual(shown, [
    { id: '1', title: 'One', hasVoted: false, voteCount: 3 },
    { id: '2', title: 'Two', hasVoted: true, voteCount: 6 },
  ])
})

test('patchViewerFields: keeps items the fresh list does not hold, and adds none', () => {
  const shown = [{ id: '1', hasLiked: false }, { id: '9', hasLiked: false }]
  patchViewerFields(shown, [{ id: '1', hasLiked: true }, { id: '5', hasLiked: true }], ['hasLiked'])
  assert.deepEqual(shown, [{ id: '1', hasLiked: true }, { id: '9', hasLiked: false }])
})

test('patchViewerFields: walks the children key (comment replies)', () => {
  const shown = [{ id: 'p', hasLiked: false, likeCount: 0, children: [{ id: 'c', hasLiked: false, likeCount: 1 }] }]
  patchViewerFields(shown, [{ id: 'p', hasLiked: true, likeCount: 1, children: [{ id: 'c', hasLiked: true, likeCount: 2 }] }], ['hasLiked', 'likeCount'], 'children')
  assert.deepEqual(shown, [{ id: 'p', hasLiked: true, likeCount: 1, children: [{ id: 'c', hasLiked: true, likeCount: 2 }] }])
})
