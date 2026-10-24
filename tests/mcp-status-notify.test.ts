import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { notifyFeedbackStatus, type StatusNotifyDeps } from '../server/services/status-notify'
import { writeResult } from '../server/mcp/output'
import type { ContentContext } from '../server/services/content-context'

// The MCP tool notify_feedback_status: the agent's form of the "send" button
// after a status change (POST /api/admin/posts/:id/notify-status). A status
// move through update_feedback sends nothing; only this call mails anyone.

const POST_ID = '7f1c2a8e-0000-4000-8000-000000000001'
const recipients = [
  { user_id: 'u-author', email: 'author@example.com', post_slug: 'adjusted-data', post_title: 'Adjusted data' },
  { user_id: 'u-voter', email: 'voter@example.com', post_slug: 'adjusted-data', post_title: 'Adjusted data' },
]

function setup(options: { role?: string; status?: string | null; recipients?: typeof recipients } = {}) {
  const calls: unknown[][] = []
  const afterCommit: ContentContext['afterCommit'] = []
  const context = { orgId: 'default-org', userId: 'u-owner', role: options.role ?? 'owner', origin: 'https://roadmap-staging.marketdata.app', afterCommit } as unknown as ContentContext
  const deps: StatusNotifyDeps = {
    findStatus: async (_context, id) => { calls.push(['findStatus', id]); return options.status === undefined ? 'done' : options.status },
    resolveBranding: async orgId => { calls.push(['resolveBranding', orgId]); return { slug: 'default-org', brandColor: '#1447E6' } },
    resolveRecipients: async (orgId, postId, actorId) => { calls.push(['resolveRecipients', orgId, postId, actorId]); return options.recipients ?? recipients },
    markUnread: async (postId, actorId) => { calls.push(['markUnread', postId, actorId]) },
    deliver: async (...args) => { calls.push(['deliver', ...args]) },
  }
  const runAfterCommit = async () => { for (const task of afterCommit) await task() }
  return { calls, context, deps, runAfterCommit }
}

test('a contributor cannot send a status email', async () => {
  const { calls, context, deps } = setup({ role: 'contributor' })
  await assert.rejects(notifyFeedbackStatus(context, POST_ID, { status: 'done' }, deps), { statusCode: 403 })
  assert.deepEqual(calls, [])
})

test('an unknown post gives NOT_FOUND', async () => {
  const { context, deps, calls } = setup({ status: null })
  await assert.rejects(notifyFeedbackStatus(context, POST_ID, { status: 'done' }, deps), { statusCode: 404 })
  assert.deepEqual(calls, [['findStatus', POST_ID]])
})

test('a status that differs from the post status sends nothing', async () => {
  const { context, deps, calls, runAfterCommit } = setup({ status: 'planned' })
  await assert.rejects(notifyFeedbackStatus(context, POST_ID, { status: 'done' }, deps), { statusCode: 409, data: { code: 'STATUS_CHANGED' } })
  await runAfterCommit()
  assert.deepEqual(calls, [['findStatus', POST_ID]])
})

test('the email goes to the subscribers only after the commit, with the status and the note', async () => {
  const { context, deps, calls, runAfterCommit } = setup()
  const value = await notifyFeedbackStatus(context, POST_ID, { status: 'done', note: 'Shipped in v2.' }, deps)
  assert.deepEqual(value, { id: POST_ID, status: 'done', recipients: 2 })
  assert.equal(calls.some(call => call[0] === 'deliver' || call[0] === 'markUnread'), false, 'nothing is sent inside the transaction')

  await runAfterCommit()
  assert.deepEqual(calls.filter(call => call[0] === 'markUnread' || call[0] === 'deliver'), [
    ['markUnread', POST_ID, 'u-owner'],
    ['deliver', 'default-org', 'default-org', '#1447E6', recipients, 'post.status_changed', { to: 'done', note: 'Shipped in v2.' }, 'https://roadmap-staging.marketdata.app'],
  ])
  assert.deepEqual(calls.find(call => call[0] === 'resolveRecipients'), ['resolveRecipients', 'default-org', POST_ID, 'u-owner'])
})

test('an empty note is left out of the email', async () => {
  const { context, deps, calls, runAfterCommit } = setup()
  await notifyFeedbackStatus(context, POST_ID, { status: 'done', note: '' }, deps)
  await runAfterCommit()
  const deliver = calls.find(call => call[0] === 'deliver')!
  assert.deepEqual(deliver[6], { to: 'done', note: undefined })
})

test('a post with no subscribers sends no email', async () => {
  const { context, deps, calls, runAfterCommit } = setup({ recipients: [] })
  const value = await notifyFeedbackStatus(context, POST_ID, { status: 'done' }, deps)
  await runAfterCommit()
  assert.equal(value.recipients, 0)
  assert.equal(calls.some(call => call[0] === 'deliver'), false)
})

test('the MCP write result names the post, the status and the recipient count only', () => {
  assert.deepEqual(writeResult({ organization_id: 'default-org', id: POST_ID, status: 'done', recipients: 2, emails: ['author@example.com'] }, 'status_notification'), {
    organization_id: 'default-org', id: POST_ID, status: 'done', recipients: 2,
  })
})
