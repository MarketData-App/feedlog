import { shouldReloadOnUserChange, type UserRef } from '~/utils/session-refresh'

// Per-user state (vote highlight, subscription) sits in refs a soft session
// refresh won't rebuild — hard-reload on account switch so it can't leak.
//
// MarketData: only a switch from one real account to another reloads. A first
// sign-in (nobody or a guest before) shows no other account's data; the
// background SSO handoff refreshes that in place (useSessionRefresh), so the
// page does not change under the visitor. See ~/utils/session-refresh.
export default defineNuxtPlugin(() => {
  if (/\/widget\/embed\/?$/.test(window.location.pathname)) return
  const { data: session } = useAuthSession()
  watch(
    (): UserRef | null => {
      const user = session.value?.user
      return user ? { id: user.id, isAnonymous: !!user.isAnonymous } : null
    },
    (next, prev) => {
      if (shouldReloadOnUserChange(prev, next)) reloadNuxtApp()
    },
  )
})
