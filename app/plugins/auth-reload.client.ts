import { sessionChangeAction, type UserRef } from '~/utils/session-refresh'

// Per-user state (vote highlight, subscription) sits in refs a soft session
// refresh won't rebuild — hard-reload on account switch so it can't leak.
//
// MarketData: only a switch from one real account to another reloads. Any
// other user change on the page (the background SSO handoff, the login dialog,
// a sign-out that stays on the page) is drawn in place: the session epoch tells
// every surface with per-viewer flags (votes, likes, subscription) to fetch
// them again (useSessionRefresh). This is the one place that moves the epoch,
// so each change re-syncs once. See ~/utils/session-refresh.
export default defineNuxtPlugin(() => {
  if (/\/widget\/embed\/?$/.test(window.location.pathname)) return
  const { data: session } = useAuthSession()
  const epoch = useSessionEpoch()
  watch(
    (): UserRef | null => {
      const user = session.value?.user
      return user ? { id: user.id, isAnonymous: !!user.isAnonymous } : null
    },
    (next, prev) => {
      const action = sessionChangeAction(prev, next)
      if (action === 'reload') reloadNuxtApp()
      else if (action === 'resync') epoch.value++
    },
  )
})
