// MarketData: the signal for "the session's user changed on this page, without
// a reload" (the background SSO handoff, the login dialog, a sign-out that
// stays on the page). The auth-reload plugin moves it (sessionChangeAction). A
// surface that shows per-viewer state (vote, like, subscription flags)
// registers onSessionRefreshed() and fetches those fields again, patching them
// onto what is on screen (~/utils/session-refresh). The auth-session payload
// is already fresh then, so reactive session readers need nothing.

export function useSessionEpoch() {
  return useState('session-epoch', () => 0)
}

// Client only; the watcher stops with the component that registered it.
export function onSessionRefreshed(callback: () => void | Promise<void>) {
  if (!import.meta.client) return
  const epoch = useSessionEpoch()
  watch(epoch, () => {
    Promise.resolve(callback()).catch(() => { /* the next page load shows the fresh state */ })
  })
}
