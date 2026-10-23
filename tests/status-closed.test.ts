import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { ACTIVE_STATUSES, POST_STATUSES, ROADMAP_STATUSES, STATUS_CONFIG, isVotingClosed, canToggleVote, statusLabelKey } from '../shared/types/post'
import { updatePostSchema } from '../shared/schemas/post'

const locale = (name: string) => JSON.parse(readFileSync(new URL(`../i18n/locales/${name}.json`, import.meta.url), 'utf8'))

test('closed is a post status but not active or on the roadmap', () => {
  assert.ok((POST_STATUSES as readonly string[]).includes('closed'))
  assert.ok(!(ROADMAP_STATUSES as readonly string[]).includes('closed'))
  assert.ok(!(ACTIVE_STATUSES as readonly string[]).includes('closed'))
  assert.equal(STATUS_CONFIG.closed.label, 'Closed')
})

test('the update schema accepts closed and rejects declined', () => {
  assert.equal(updatePostSchema.safeParse({ status: 'closed' }).success, true)
  assert.equal(updatePostSchema.safeParse({ status: 'declined' }).success, false)
})

test('the closed label key exists in en and zh', () => {
  const key = statusLabelKey('closed')
  assert.equal(key, 'status.closed')
  for (const l of ['en', 'zh']) assert.ok(typeof locale(l).status.closed === 'string', l)
})

test('isVotingClosed is true for closed or merged posts', () => {
  assert.equal(isVotingClosed('closed', null), true)
  assert.equal(isVotingClosed('open', null), false)
  assert.equal(isVotingClosed('open', 'some-id'), true)
})

test('the web roadmap query keeps closed off', () => {
  const src = readFileSync(new URL('../server/services/feedback-web-queries.ts', import.meta.url), 'utf8')
  assert.match(src, /const ROADMAP_STATUSES = \['planned', 'in_progress', 'done'\] as const/)
})

test('canToggleVote: closed refuses new votes but allows removing one', () => {
  assert.equal(canToggleVote('closed', null, false), false)
  assert.equal(canToggleVote('closed', null, true), true)
  assert.equal(canToggleVote('open', null, false), true)
  assert.equal(canToggleVote('open', null, true), true)
  assert.equal(canToggleVote('open', 'some-id', true), false)
})
