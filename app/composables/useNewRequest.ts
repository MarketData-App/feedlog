// MarketData: the board bar's "New request" opens the board's existing composer
// (the SubmitModal on the feedback list, behind its own sign-in / guest gate).
// From any other public page it first goes to the list. The request is shared
// state rather than a `?new=1` link: that link opens the form to signed-out
// visitors on purpose (they arrive holding a draft), which a plain button must
// not do.
export function useNewRequest() {
  const pending = useState('board-new-request', () => false)
  const route = useRoute()
  const localePath = useLocalePath()
  const routeBaseName = useRouteBaseName()

  async function request() {
    pending.value = true
    if (routeBaseName(route) !== 'index') await navigateTo(localePath('/'))
  }

  // For the list page: run `open` once for each pending request.
  function take(open: () => void) {
    if (!pending.value) return
    pending.value = false
    open()
  }

  return { pending, request, take }
}
