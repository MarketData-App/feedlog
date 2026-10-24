import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { post } from '../db/schemas'
import type { NotificationPayload } from '../db/schemas'
import type { ContentContext } from './content-context'
import type { RecipientRow } from '../utils/notifications'

// MarketData: the MCP form of the "send" button that follows a status change
// (POST /api/admin/posts/:id/notify-status). update_feedback moves a status
// silently; this call is the only MCP path that mails the post's subscribers.
// The helpers come in as `deps` because the notification and database modules
// resolve the #layers alias, which the node test runner cannot load.

export interface StatusNotifyDeps {
  findStatus: (context: ContentContext, id: string) => Promise<string | null>
  resolveBranding: (orgId: string) => Promise<{ slug: string; brandColor: string }>
  resolveRecipients: (orgId: string, postId: string, actorId: string) => Promise<RecipientRow[]>
  markUnread: (postId: string, actorId: string) => Promise<void>
  deliver: (orgId: string, orgSlug: string, brandColor: string, recipients: RecipientRow[], typeKey: 'post.status_changed', payload: NotificationPayload, requestOrigin?: string) => Promise<void>
}

export async function findPostStatus(context: ContentContext, id: string) {
  const [row] = await context.db.select({ status: post.status }).from(post).where(and(eq(post.id, id), eq(post.orgId, context.orgId))).limit(1)
  return row?.status ?? null
}

export async function notifyFeedbackStatus(context: ContentContext, id: string, input: { status: string; note?: string }, deps: StatusNotifyDeps) {
  // The isModerator rule of content-context, which loads the database itself.
  if (!['owner', 'manager'].includes(context.role ?? '')) throw createError({ statusCode: 403, message: 'Organization administrator access is required', data: { code: 'FORBIDDEN' } })
  const current = await deps.findStatus(context, id)
  if (current === null) throw createError({ statusCode: 404, message: 'Feedback not found', data: { code: 'NOT_FOUND' } })
  // As in the web endpoint: announce only the status the caller saw.
  if (current !== input.status) throw createError({ statusCode: 409, message: `The feedback status is ${current}, not ${input.status}. Read the feedback again before you notify.`, data: { code: 'STATUS_CHANGED' } })

  const { slug, brandColor } = await deps.resolveBranding(context.orgId)
  const recipients = slug ? await deps.resolveRecipients(context.orgId, id, context.userId) : []
  context.afterCommit.push(async () => {
    await deps.markUnread(id, context.userId).catch((err: unknown) => console.error('[widget] unread mark failed', err))
    if (recipients.length > 0) await deps.deliver(context.orgId, slug, brandColor, recipients, 'post.status_changed', { to: input.status, note: input.note || undefined }, context.origin)
  })
  return { id, status: input.status, recipients: recipients.length }
}
