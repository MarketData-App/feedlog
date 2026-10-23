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
// board signs that session out. A /team-login (local) session is never touched.
//
// Everything here is pure so the rules can be tested without a browser.

export const SILENT_PATH = '/sso/silent'
export const SILENT_MESSAGE_TYPE = 'feedlog:sso-silent'
export const SSO_REDIRECTED_KEY = 'feedlog:sso-redirected'
export const HANDOFF_TIMEOUT_MS = 8000

export type HandoffStep = 'none' | 'iframe' | 'redirect' | 'signout'

export interface HandoffInput {
  /** The dashboard's user, or null when the dashboard reports nobody. */
  amemberUser: object | null
  /** The board session as boardSessionFor() reads it; null when there is none. */
  boardSession: { ssoOrgId?: string | null } | null
  redirectedThisSession: boolean
  iframeFailed: boolean
}

export function decideHandoff(input: HandoffInput): HandoffStep {
  const { amemberUser, boardSession, redirectedThisSession, iframeFailed } = input
  if (boardSession) {
    // A team-login (local) session belongs to the board admin, not to the
    // dashboard: nothing the dashboard says changes it.
    if (!boardSession.ssoOrgId) return 'none'
    return amemberUser ? 'none' : 'signout'
  }
  if (!amemberUser) return 'none'
  if (!iframeFailed) return 'iframe'
  return redirectedThisSession ? 'none' : 'redirect'
}

interface SessionLike {
  user?: { isAnonymous?: boolean | null } | null
  session?: { ssoOrgId?: string | null } | null
}

// A guest (anonymous) identity is not an account: for the handoff it is no
// session, so a customer who wrote as a guest is still signed in, and the
// layout's claim-on-load folds the guest's writes into the account.
export function boardSessionFor(session: SessionLike | null | undefined): { ssoOrgId: string | null } | null {
  if (!session?.user || session.user.isAnonymous) return null
  return { ssoOrgId: session.session?.ssoOrgId ?? null }
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
