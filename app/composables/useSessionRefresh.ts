// MarketData: the signal for "the session changed on this page, without a
// reload" (the background SSO handoff). A surface that shows per-viewer state
// (vote, like, subscription flags) registers onSessionRefreshed() and fetches
// those fields again, patching them onto what is on screen
// (~/utils/session-refresh). The auth-session payload itself is refreshed
// before the signal, so reactive session readers need nothing.

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
