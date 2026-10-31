// Pure notification helpers — no DB, no Nuxt runtime, so they unit-test in
// isolation (pure functions are the highest-value tests). The
// DB-touching emit/send logic lives in server/utils/notifications.ts.

import { type NotificationTypeKey } from '../constants/notifications'

export interface OrgListSession {
  orgList?: { orgId: string; role: string }[]
}

// A comment author is an admin (→ official reply) when their session role in
// this org is owner or manager — read straight from the session, no DB query.
// Portal SSO sessions carry no orgList, so they are never admins.
export function isActorAdmin(session: OrgListSession, orgId: string): boolean {
  const role = session.orgList?.find(o => o.orgId === orgId)?.role
  return role === 'owner' || role === 'manager'
}

// The subscriber-side comment decision table. MarketData: no comment notifies
// subscribers, also not an admin's top-level comment (selden, 2026-10-31: "don't
// notify customers on new comments/votes on their issues. only status changes.").
// Customers get only the status-change email. The team still gets its emails for
// new requests and customer comments (post.created, post.user_commented).
export function resolveCommentEvents(_input: { isTopLevel: boolean; authorIsAdmin: boolean }): NotificationTypeKey[] {
  return []
}
