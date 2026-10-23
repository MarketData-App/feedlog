// MarketData: a sign-in that happens on the page (the background SSO handoff)
// updates the page in place instead of reloading it, so nothing the visitor
// sees moves: typed text, open dialogs, scroll and focus stay.
//
// Two rules make that safe:
// - Reload only when another account's data could be on screen: the old user
//   was a real (non-guest) account and the new user is a different one. A
//   first sign-in, or a guest becoming an account, shows no other account's
//   data. A sign-out is left to its caller (most of them navigate anyway).
// - Per-viewer fields (vote, like, subscription flags) are fetched again and
//   copied onto the items already on screen, by id. The lists keep their
//   objects, order and length, so the DOM is kept.

export interface UserRef {
  id: string
  isAnonymous?: boolean | null
}

export function shouldReloadOnUserChange(prev: UserRef | null | undefined, next: UserRef | null | undefined): boolean {
  if (!prev?.id || prev.isAnonymous) return false
  return !!next?.id && next.id !== prev.id
}

// Copies the named fields from `fresh` onto the matching items of `shown` (by
// id), in place, and walks `childrenKey` the same way. Items that `fresh` does
// not hold stay as they are; nothing is added or removed.
export function patchViewerFields<T extends { id: string }>(
  shown: T[],
  fresh: T[],
  fields: (keyof T)[],
  childrenKey?: keyof T,
): void {
  const byId = new Map(fresh.map(item => [item.id, item]))
  for (const item of shown) {
    const update = byId.get(item.id)
    if (!update) continue
    for (const field of fields) {
      if (field in update) item[field] = update[field]
    }
    if (childrenKey) {
      const kids = item[childrenKey] as unknown
      const freshKids = update[childrenKey] as unknown
      if (Array.isArray(kids) && Array.isArray(freshKids)) {
        patchViewerFields(kids as T[], freshKids as T[], fields, childrenKey)
      }
    }
  }
}
