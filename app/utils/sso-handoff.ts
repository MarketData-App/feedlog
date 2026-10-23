import { buildSsoLoginUrl } from './sso-login-url'

// MarketData: the board follows the dashboard login (spec §11).
//
// The kit's account control in the site header asks the dashboard who is
// logged in. When the dashboard has a customer and the board has no session,
// the board loads the aMember feedlog-sso plugin in a hidden iframe with
// return_to=/sso/silent; the plugin hands a signed token to /api/sso/jwt, which
// sets the board session and lands on /sso/silent, which tells this page by
// postMessage. If that cannot finish (blocked cookies, a slow or refused
// frame), the page falls back to one top-level redirect per browser session.
// When the dashboard reports nobody and the board holds an SSO session, the
// board signs that session out. When the dashboard reports another account than
// the board's SSO session (a shared computer, or a sign-in link someone else
// made), the board signs its session out and hands off again ('switch'). A
// /team-login (local) session is never touched.
//
// Everything here is pure so the rules can be tested without a browser.

export const SILENT_PATH = '/sso/silent'
export const SILENT_MESSAGE_TYPE = 'feedlog:sso-silent'
export const SSO_REDIRECTED_KEY = 'feedlog:sso-redirected'
export const HANDOFF_TIMEOUT_MS = 8000

export type HandoffStep = 'none' | 'iframe' | 'redirect' | 'signout' | 'switch'

export interface BoardSessionView {
  ssoOrgId?: string | null
  email?: string | null
}

export interface HandoffInput {
  /** The dashboard's user, or null when the dashboard reports nobody. */
  amemberUser: object | null
  /** The board session as boardSessionFor() reads it; null when there is none. */
  boardSession: BoardSessionView | null
  redirectedThisSession: boolean
  iframeFailed: boolean
}

function normalEmail(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null
}

export function decideHandoff(input: HandoffInput): HandoffStep {
  const { amemberUser, boardSession, redirectedThisSession, iframeFailed } = input
  if (boardSession) {
    // A team-login (local) session belongs to the board admin, not to the
    // dashboard: nothing the dashboard says changes it.
    if (!boardSession.ssoOrgId) return 'none'
    if (!amemberUser) return 'signout'
    // The header shows the dashboard's account; the board must act as the
    // same one. Compared only when both sides carry an email.
    const dashboardEmail = normalEmail((amemberUser as { email?: unknown }).email)
    const boardEmail = normalEmail(boardSession.email)
    return dashboardEmail && boardEmail && dashboardEmail !== boardEmail ? 'switch' : 'none'
  }
  if (!amemberUser) return 'none'
  if (!iframeFailed) return 'iframe'
  return redirectedThisSession ? 'none' : 'redirect'
}

interface SessionLike {
  user?: { isAnonymous?: boolean | null, email?: string | null } | null
  session?: { ssoOrgId?: string | null } | null
}

// A guest (anonymous) identity is not an account: for the handoff it is no
// session, so a customer who wrote as a guest is still signed in, and the
// guest's writes are claimed into the account.
export function boardSessionFor(session: SessionLike | null | undefined): { ssoOrgId: string | null, email: string | null } | null {
  if (!session?.user || session.user.isAnonymous) return null
  return { ssoOrgId: session.session?.ssoOrgId ?? null, email: session.user.email ?? null }
}

export type DashboardUser =
  | { kind: 'user', user: object }
  | { kind: 'none' }
  | { kind: 'unknown' }

// The dashboard answers 401 when nobody is logged in. Anything other than a
// clear "user" or a clear "nobody" is unknown, and unknown never signs anyone
// out: a network error or a CORS refusal must not end a board session.
export function classifyUserResponse(status: number, body: unknown): DashboardUser {
  if (status === 401 || status === 403) return { kind: 'none' }
  if (status !== 200 || !body || typeof body !== 'object') return { kind: 'unknown' }
  const user = body as { email?: unknown, login?: unknown }
  if (typeof user.email !== 'string' && typeof user.login !== 'string') return { kind: 'unknown' }
  return { kind: 'user', user: body }
}

// The dashboard login, returning to the page the visitor is on.
export function buildLoginHref(loginUrl: string, currentUrl: string): string {
  const url = new URL(loginUrl)
  url.searchParams.set('amember_redirect_url', currentUrl)
  return url.href
}

// Whether a link points at one of the dashboard endpoints (same origin and path).
export function isEndpointLink(href: string, endpoint: string): boolean {
  try {
    const link = new URL(href)
    const target = new URL(endpoint)
    return link.origin === target.origin && link.pathname === target.pathname
  }
  catch {
    return false
  }
}

export type HeaderLinkAction = { kind: 'ignore' } | { kind: 'login', href: string } | { kind: 'logout' }

// What a pointer, focus or click event on a header link asks for. A login link
// gets the current page as its return address just before use. "Log out" is
// taken over (the board's SSO session ends first) only for a plain click while
// the board holds an SSO session; a new-tab click is left to the browser, and
// the logout sync on the next board page covers it.
export function headerLinkAction(input: {
  eventType: string
  href: string | null | undefined
  loginUrl: string
  logoutUrl: string
  currentUrl: string
  isSsoSession: boolean
  button: number
  modified: boolean
  defaultPrevented: boolean
}): HeaderLinkAction {
  const { href } = input
  if (!href) return { kind: 'ignore' }
  if (isEndpointLink(href, input.loginUrl)) return { kind: 'login', href: buildLoginHref(href, input.currentUrl) }
  if (
    input.eventType === 'click'
    && isEndpointLink(href, input.logoutUrl)
    && input.isSsoSession
    && input.button === 0
    && !input.modified
    && !input.defaultPrevented
  ) return { kind: 'logout' }
  return { kind: 'ignore' }
}

// The plugin URL for the hidden iframe. /api/sso/jwt keeps a return_to on the
// board host only (validateReturnTo), so this cannot be turned into a redirect
// elsewhere.
export function silentHandoffUrl(ssoLoginUrl: string, ownOrigin: string): string {
  return buildSsoLoginUrl(ssoLoginUrl, `${ownOrigin}${SILENT_PATH}`)
}

export function isSilentMessage(event: { origin: string, data: unknown }, ownOrigin: string): boolean {
  if (event.origin !== ownOrigin) return false
  const data = event.data
  return !!data && typeof data === 'object' && (data as { type?: unknown }).type === SILENT_MESSAGE_TYPE
}

// Waits for /sso/silent in the given frame to report back. Resolves false when
// the time runs out (a refused frame, an aMember login form, blocked cookies).
export function waitForSilentMessage(opts: {
  target: EventTarget
  ownOrigin: string
  source: unknown
  timeoutMs: number
}): Promise<boolean> {
  return new Promise((resolve) => {
    const onMessage = (event: Event) => {
      const message = event as Event & { origin: string, data: unknown, source: unknown }
      if (message.source !== opts.source || !isSilentMessage(message, opts.ownOrigin)) return
      finish(true)
    }
    const timer = setTimeout(() => finish(false), opts.timeoutMs)
    function finish(ok: boolean) {
      clearTimeout(timer)
      opts.target.removeEventListener('message', onMessage)
      resolve(ok)
    }
    opts.target.addEventListener('message', onMessage)
  })
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

// Storage that cannot be read counts as "already redirected": a page that
// cannot remember its redirect must never make one, or it could loop.
export function readRedirected(storage: Pick<Storage, 'getItem'> | null | undefined): boolean {
  if (!storage) return true
  try {
    return storage.getItem(SSO_REDIRECTED_KEY) !== null
  }
  catch {
    return true
  }
}

// True only when the mark is stored and reads back; the caller redirects only then.
export function markRedirected(storage: StorageLike | null | undefined): boolean {
  if (!storage) return false
  try {
    storage.setItem(SSO_REDIRECTED_KEY, '1')
    return storage.getItem(SSO_REDIRECTED_KEY) === '1'
  }
  catch {
    return false
  }
}

// Pages where the handoff never runs: the board admin's sign-in, the SSO pages
// themselves (one of them is the iframe), and the admin dashboard.
export function isHandoffExcludedPath(path: string, localeCodes: string[]): boolean {
  const [, first, ...rest] = path.split('/')
  const bare = first && localeCodes.includes(first) ? `/${rest.join('/')}` : path
  return bare === '/team-login'
    || bare.startsWith('/team-login/')
    || bare === '/sso'
    || bare.startsWith('/sso/')
    || bare === '/dashboard'
    || bare.startsWith('/dashboard/')
}

export type HandoffOutcome = 'skipped' | 'unknown' | 'none' | 'signed-in' | 'signed-out' | 'redirected' | 'failed'

// What the page provides to the handoff run (the composable wires the real
// browser and Nuxt pieces; the tests use fakes).
export interface HandoffDeps {
  ssoLoginUrl: string
  path: string
  localeCodes: string[]
  storage: StorageLike | null
  /** The board session now (boardSessionFor of the session payload). */
  boardSession: () => BoardSessionView | null
  fetchDashboardUser: () => Promise<DashboardUser>
  /** Ends the board session; true when it worked. */
  signOutBoard: () => Promise<boolean>
  /** The hidden iframe round trip; true when /sso/silent answered. */
  silentHandoff: () => Promise<boolean>
  /** Reads the new board session into the page without a reload. */
  refreshInPlace: () => Promise<void>
  /** After a sign-out: reads the empty session and clears the old account's view. */
  afterSignOut: () => Promise<void>
  redirect: (url: string) => void
  currentUrl: () => string
}

// One run per page load (the default layout's mount).
export async function runHandoffFlow(deps: HandoffDeps): Promise<HandoffOutcome> {
  if (!deps.ssoLoginUrl || isHandoffExcludedPath(deps.path, deps.localeCodes)) return 'skipped'
  const board = deps.boardSession()
  // Nothing the dashboard says changes a team-login session: do not ask.
  if (board && !board.ssoOrgId) return 'skipped'

  const dashboard = await deps.fetchDashboardUser()
  // No clear answer (network, CORS): leave everything as it is.
  if (dashboard.kind === 'unknown') return 'unknown'
  const amemberUser = dashboard.kind === 'user' ? dashboard.user : null

  let step = decideHandoff({
    amemberUser,
    boardSession: board,
    redirectedThisSession: readRedirected(deps.storage),
    iframeFailed: false,
  })
  if (step === 'signout') {
    if (!(await deps.signOutBoard())) return 'failed'
    await deps.afterSignOut()
    return 'signed-out'
  }
  let switched = false
  if (step === 'switch') {
    // The old account's session ends before the new one is fetched.
    if (!(await deps.signOutBoard())) return 'failed'
    switched = true
    step = 'iframe'
  }
  if (step !== 'iframe') return 'none'

  if (await deps.silentHandoff()) {
    await deps.refreshInPlace()
    if (deps.boardSession()) return 'signed-in'
  }

  // The board has no session now (none before, or signed out for the switch).
  const next = decideHandoff({
    amemberUser,
    boardSession: null,
    redirectedThisSession: readRedirected(deps.storage),
    iframeFailed: true,
  })
  // Mark first; a page that cannot keep the mark never redirects.
  if (next === 'redirect' && markRedirected(deps.storage)) {
    deps.redirect(buildSsoLoginUrl(deps.ssoLoginUrl, deps.currentUrl()))
    return 'redirected'
  }
  if (switched) await deps.afterSignOut()
  return 'failed'
}
