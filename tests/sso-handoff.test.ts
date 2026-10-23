import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createApp, createError, createEvent, defineEventHandler, setResponseHeader, toWebHandler, type H3Event } from 'h3'

// server/* is written against Nitro's auto-imports.
Object.assign(globalThis, {
  createError,
  defineEventHandler,
  setResponseHeader,
  useRuntimeConfig: (event: H3Event) => ({ public: { i18n: event.context.testI18n } }),
})

const {
  DASHBOARD_TIMEOUT_MS,
  HANDOFF_TIMEOUT_MS,
  NAVIGATION_MAX_PAGE_AGE_MS,
  SILENT_MESSAGE_TYPE,
  SILENT_PATH,
  SSO_REDIRECTED_KEY,
  boardSessionFor,
  buildLoginHref,
  classifyUserResponse,
  decideHandoff,
  fetchDashboardUserWith,
  headerLinkAction,
  holdsTypedText,
  isEndpointLink,
  isHandoffExcludedPath,
  isSilentMessage,
  isTextEntry,
  markRedirected,
  mayNavigateAway,
  readRedirected,
  runHandoffFlow,
  silentHandoffUrl,
  waitForSilentMessage,
} = await import('../app/utils/sso-handoff')
const { validateReturnTo } = await import('../server/utils/sso')
const { default: frameAncestors } = await import('../server/middleware/01-frame-ancestors')

const BOARD = 'https://roadmap-staging.marketdata.app'
const LOGIN = 'https://dashboard-staging.marketdata.app/marketdata/login'
const PLUGIN = 'https://dashboard-staging.marketdata.app/marketdata/misc/feedlog-sso'
const customer = { login: 'cust', email: 'cust@example.com' }
const ssoSession = { ssoOrgId: 'org-1' }
const teamSession = { ssoOrgId: null }

// ── decideHandoff: one case per rule ────────────────────────────────────────

test('decideHandoff: dashboard user and no board session → iframe', () => {
  assert.equal(decideHandoff({ amemberUser: customer, boardSession: null, redirectedThisSession: false, iframeFailed: false }), 'iframe')
  // A redirect earlier in this tab does not stop a silent try.
  assert.equal(decideHandoff({ amemberUser: customer, boardSession: null, redirectedThisSession: true, iframeFailed: false }), 'iframe')
})

test('decideHandoff: iframe failed and no redirect yet this session → one top-level redirect', () => {
  assert.equal(decideHandoff({ amemberUser: customer, boardSession: null, redirectedThisSession: false, iframeFailed: true }), 'redirect')
})

test('decideHandoff: iframe failed after this session already redirected → none (no loop)', () => {
  assert.equal(decideHandoff({ amemberUser: customer, boardSession: null, redirectedThisSession: true, iframeFailed: true }), 'none')
})

test('decideHandoff: no dashboard user and an SSO board session → signout', () => {
  assert.equal(decideHandoff({ amemberUser: null, boardSession: ssoSession, redirectedThisSession: false, iframeFailed: false }), 'signout')
  assert.equal(decideHandoff({ amemberUser: null, boardSession: ssoSession, redirectedThisSession: true, iframeFailed: true }), 'signout')
})

test('decideHandoff: a team-login (local) board session → none, whatever the dashboard says', () => {
  for (const amemberUser of [null, customer]) {
    for (const boardSession of [teamSession, {}]) {
      for (const iframeFailed of [false, true]) {
        assert.equal(decideHandoff({ amemberUser, boardSession, redirectedThisSession: false, iframeFailed }), 'none')
      }
    }
  }
})

test('decideHandoff: dashboard user and an SSO board session → none', () => {
  assert.equal(decideHandoff({ amemberUser: customer, boardSession: ssoSession, redirectedThisSession: false, iframeFailed: false }), 'none')
})

test('decideHandoff: nobody on either side → none', () => {
  assert.equal(decideHandoff({ amemberUser: null, boardSession: null, redirectedThisSession: false, iframeFailed: false }), 'none')
})

// ── The board session as the handoff sees it ────────────────────────────────

test('boardSessionFor: no session and a guest (anonymous) session count as no board session', () => {
  assert.equal(boardSessionFor(null), null)
  assert.equal(boardSessionFor(undefined), null)
  assert.equal(boardSessionFor({ user: null }), null)
  assert.equal(boardSessionFor({ user: { id: 'g', isAnonymous: true }, session: { ssoOrgId: null } }), null)
})

test('boardSessionFor: keeps the ssoOrgId marker (null for a local session) and the user email', () => {
  assert.deepEqual(boardSessionFor({ user: { id: 'u', email: 'a@x.com' }, session: { ssoOrgId: 'org-1' } }), { ssoOrgId: 'org-1', email: 'a@x.com' })
  assert.deepEqual(boardSessionFor({ user: { id: 'u', email: 'a@x.com' }, session: { ssoOrgId: null } }), { ssoOrgId: null, email: 'a@x.com' })
  assert.deepEqual(boardSessionFor({ user: { id: 'u' }, session: {} }), { ssoOrgId: null, email: null })
})

// ── Fix round 1, finding 2: the board acts as the account the dashboard shows ──

const ssoA = { ssoOrgId: 'org-1', email: 'alice@example.com' }

test('decideHandoff: SSO board session for another email than the dashboard user → switch', () => {
  assert.equal(decideHandoff({ amemberUser: { email: 'bob@example.com' }, boardSession: ssoA, redirectedThisSession: false, iframeFailed: false }), 'switch')
  assert.equal(decideHandoff({ amemberUser: { email: 'bob@example.com' }, boardSession: ssoA, redirectedThisSession: true, iframeFailed: true }), 'switch')
})

test('decideHandoff: the same email in any case or with spaces → none', () => {
  for (const email of ['alice@example.com', 'ALICE@Example.COM', '  alice@example.com ']) {
    assert.equal(decideHandoff({ amemberUser: { email }, boardSession: ssoA, redirectedThisSession: false, iframeFailed: false }), 'none', email)
  }
})

test('decideHandoff: a local session is never switched, whatever the dashboard email', () => {
  assert.equal(decideHandoff({ amemberUser: { email: 'bob@example.com' }, boardSession: { ssoOrgId: null, email: 'admin@example.com' }, redirectedThisSession: false, iframeFailed: false }), 'none')
})

test('decideHandoff: no email on one side gives no switch (nothing to compare)', () => {
  assert.equal(decideHandoff({ amemberUser: { login: 'bob' }, boardSession: ssoA, redirectedThisSession: false, iframeFailed: false }), 'none')
  assert.equal(decideHandoff({ amemberUser: { email: 'bob@example.com' }, boardSession: { ssoOrgId: 'org-1', email: null }, redirectedThisSession: false, iframeFailed: false }), 'none')
})

// ── The handoff run, with fakes for the page (no browser) ──────────────────

function flow(over: Partial<Parameters<typeof runHandoffFlow>[0]> & { board?: { ssoOrgId: string | null, email: string | null } | null, dashboard?: unknown, afterHandoffBoard?: { ssoOrgId: string | null, email: string | null } | null } = {}) {
  const calls: string[] = []
  let board = over.board === undefined ? null : over.board
  const storage = memoryStorage()
  const deps = {
    ssoLoginUrl: PLUGIN,
    path: '/p/abc',
    localeCodes: ['en', 'zh'],
    storage,
    boardSession: () => board,
    fetchDashboardUser: async () => { calls.push('fetch'); return (over.dashboard ?? { kind: 'user', user: { email: 'bob@example.com' } }) as never },
    signOutBoard: async () => { calls.push('signout'); board = null; return true },
    silentHandoff: async () => { calls.push('iframe'); return true },
    refreshInPlace: async () => { calls.push('refresh'); board = over.afterHandoffBoard === undefined ? { ssoOrgId: 'org-1', email: 'bob@example.com' } : over.afterHandoffBoard },
    afterSignOut: async () => { calls.push('after-signout') },
    redirect: (url: string) => { calls.push(`redirect ${url}`) },
    currentUrl: () => `${BOARD}/p/abc`,
    mayNavigate: () => true,
    ...over,
  }
  return { deps, calls, storage }
}

test('runHandoffFlow: a local (team-login) session returns before the dashboard is asked', async () => {
  const { deps, calls } = flow({ board: { ssoOrgId: null, email: 'admin@example.com' } })
  assert.equal(await runHandoffFlow(deps), 'skipped')
  assert.deepEqual(calls, [])
})

test('runHandoffFlow: excluded paths and no SSO login URL never ask the dashboard', async () => {
  for (const over of [{ path: '/team-login' }, { path: '/zh/sso/silent' }, { path: '/dashboard/posts' }, { ssoLoginUrl: '' }]) {
    const { deps, calls } = flow(over)
    assert.equal(await runHandoffFlow(deps), 'skipped', JSON.stringify(over))
    assert.deepEqual(calls, [])
  }
})

test('runHandoffFlow: an unknown dashboard answer changes nothing', async () => {
  const { deps, calls } = flow({ board: ssoA, dashboard: { kind: 'unknown' } })
  assert.equal(await runHandoffFlow(deps), 'unknown')
  assert.deepEqual(calls, ['fetch'])
})

test('runHandoffFlow: dashboard user, no board session → iframe, then refresh in place (no sign-out, no redirect)', async () => {
  const { deps, calls } = flow()
  assert.equal(await runHandoffFlow(deps), 'signed-in')
  assert.deepEqual(calls, ['fetch', 'iframe', 'refresh'])
})

test('runHandoffFlow: dashboard reports nobody and an SSO board session → sign out, then the logout refresh', async () => {
  const { deps, calls } = flow({ board: ssoA, dashboard: { kind: 'none' } })
  assert.equal(await runHandoffFlow(deps), 'signed-out')
  assert.deepEqual(calls, ['fetch', 'signout', 'after-signout'])
})

test('runHandoffFlow: another account on the dashboard → sign out first, then the iframe handoff', async () => {
  const { deps, calls } = flow({ board: ssoA })
  assert.equal(await runHandoffFlow(deps), 'signed-in')
  assert.deepEqual(calls, ['fetch', 'signout', 'iframe', 'refresh'])
})

test('runHandoffFlow: the same account in another case → nothing to do', async () => {
  const { deps, calls } = flow({ board: ssoA, dashboard: { kind: 'user', user: { email: 'Alice@Example.com' } } })
  assert.equal(await runHandoffFlow(deps), 'none')
  assert.deepEqual(calls, ['fetch'])
})

test('runHandoffFlow: a switch whose sign-out fails stops there', async () => {
  const { deps, calls } = flow({ board: ssoA, signOutBoard: async () => { calls.push('signout'); return false } })
  assert.equal(await runHandoffFlow(deps), 'failed')
  assert.deepEqual(calls, ['fetch', 'signout'])
})

test('runHandoffFlow: the iframe fails → one top-level redirect back to this page, marked first', async () => {
  const { deps, calls, storage } = flow({ afterHandoffBoard: null, silentHandoff: async () => { calls.push('iframe'); return false } })
  assert.equal(await runHandoffFlow(deps), 'redirected')
  // The session is read again before the redirect (a late cookie wins; see below).
  assert.deepEqual(calls.slice(0, 3), ['fetch', 'iframe', 'refresh'])
  assert.equal(calls.length, 4)
  assert.equal(calls[3], `redirect ${PLUGIN}?return_to=${encodeURIComponent(`${BOARD}/p/abc`)}`)
  assert.equal(storage.getItem('feedlog:sso-redirected'), '1')
  // The next load in the same tab: no second redirect.
  const again = flow({ afterHandoffBoard: null, silentHandoff: async () => { again.calls.push('iframe'); return false }, storage })
  assert.equal(await runHandoffFlow(again.deps), 'failed')
  assert.deepEqual(again.calls, ['fetch', 'iframe', 'refresh'])
})

test('runHandoffFlow: the frame answers but no board session appears (blocked cookie) → the fallback redirect', async () => {
  const { deps, calls } = flow({ afterHandoffBoard: null })
  assert.equal(await runHandoffFlow(deps), 'redirected')
  assert.deepEqual(calls.slice(0, 3), ['fetch', 'iframe', 'refresh'])
})

test('runHandoffFlow: a switch that cannot finish leaves the page signed out (logout refresh)', async () => {
  const storage = memoryStorage()
  markRedirected(storage)
  const { deps, calls } = flow({ board: ssoA, storage, afterHandoffBoard: null, silentHandoff: async () => { calls.push('iframe'); return false } })
  assert.equal(await runHandoffFlow(deps), 'failed')
  assert.deepEqual(calls, ['fetch', 'signout', 'iframe', 'refresh', 'after-signout'])
})

// ── Header links: login return address, and the Log out intercept ─────────

const LOGOUT = 'https://dashboard-staging.marketdata.app/marketdata/logout'
function linkAction(over: Partial<Parameters<typeof headerLinkAction>[0]>) {
  return headerLinkAction({ eventType: 'click', href: LOGOUT, loginUrl: LOGIN, logoutUrl: LOGOUT, currentUrl: `${BOARD}/p/abc`, isSsoSession: true, button: 0, modified: false, defaultPrevented: false, ...over })
}

test('headerLinkAction: a login link gets the current page as its return address on any event', () => {
  for (const eventType of ['pointerdown', 'focusin', 'click']) {
    const action = linkAction({ eventType, href: LOGIN, isSsoSession: false })
    assert.equal(action.kind, 'login')
    assert.equal(new URL((action as { href: string }).href).searchParams.get('amember_redirect_url'), `${BOARD}/p/abc`)
  }
})

test('headerLinkAction: Log out is intercepted only for a plain click with an SSO session', () => {
  assert.deepEqual(linkAction({}), { kind: 'logout' })
  assert.deepEqual(linkAction({ isSsoSession: false }), { kind: 'ignore' })
  assert.deepEqual(linkAction({ modified: true }), { kind: 'ignore' })
  assert.deepEqual(linkAction({ button: 1 }), { kind: 'ignore' })
  assert.deepEqual(linkAction({ defaultPrevented: true }), { kind: 'ignore' })
  assert.deepEqual(linkAction({ eventType: 'pointerdown' }), { kind: 'ignore' })
})

test('headerLinkAction: other links and no link are ignored', () => {
  assert.deepEqual(linkAction({ href: 'https://www.marketdata.app/signup/' }), { kind: 'ignore' })
  assert.deepEqual(linkAction({ href: null }), { kind: 'ignore' })
})

// ── What the dashboard API answer means ─────────────────────────────────────

test('classifyUserResponse: 200 with a user object → user', () => {
  assert.deepEqual(classifyUserResponse(200, customer), { kind: 'user', user: customer })
})

test('classifyUserResponse: 401 and 403 → logged out', () => {
  assert.deepEqual(classifyUserResponse(401, null), { kind: 'none' })
  assert.deepEqual(classifyUserResponse(403, { error: 'x' }), { kind: 'none' })
})

test('classifyUserResponse: errors and odd bodies → unknown (never a sign-out reason)', () => {
  assert.deepEqual(classifyUserResponse(500, null), { kind: 'unknown' })
  assert.deepEqual(classifyUserResponse(0, null), { kind: 'unknown' })
  assert.deepEqual(classifyUserResponse(200, null), { kind: 'unknown' })
  assert.deepEqual(classifyUserResponse(200, 'ok'), { kind: 'unknown' })
  assert.deepEqual(classifyUserResponse(200, {}), { kind: 'unknown' })
})

// ── Login link ──────────────────────────────────────────────────────────────

test('buildLoginHref adds amember_redirect_url = the current page URL', () => {
  const href = buildLoginHref(LOGIN, `${BOARD}/p/abc?sort=top#c1`)
  const url = new URL(href)
  assert.equal(url.origin + url.pathname, LOGIN)
  assert.equal(url.searchParams.get('amember_redirect_url'), `${BOARD}/p/abc?sort=top#c1`)
})

test('buildLoginHref keeps existing query params and replaces an old return URL', () => {
  const href = buildLoginHref(`${LOGIN}?lang=en&amember_redirect_url=${encodeURIComponent(`${BOARD}/old`)}`, `${BOARD}/roadmap`)
  const url = new URL(href)
  assert.equal(url.searchParams.get('lang'), 'en')
  assert.deepEqual(url.searchParams.getAll('amember_redirect_url'), [`${BOARD}/roadmap`])
})

test('isEndpointLink matches the same origin and path only', () => {
  assert.equal(isEndpointLink(`${LOGIN}?amember_redirect_url=x`, LOGIN), true)
  assert.equal(isEndpointLink(LOGIN, LOGIN), true)
  assert.equal(isEndpointLink('https://dashboard-staging.marketdata.app/marketdata/signup', LOGIN), false)
  assert.equal(isEndpointLink('https://evil.example/marketdata/login', LOGIN), false)
  assert.equal(isEndpointLink('not a url', LOGIN), false)
})

// ── The silent handoff page and its message ────────────────────────────────

test('the agreed names: /sso/silent, feedlog:sso-silent, feedlog:sso-redirected, 8 s', () => {
  assert.equal(SILENT_PATH, '/sso/silent')
  assert.equal(SILENT_MESSAGE_TYPE, 'feedlog:sso-silent')
  assert.equal(SSO_REDIRECTED_KEY, 'feedlog:sso-redirected')
  assert.equal(HANDOFF_TIMEOUT_MS, 8000)
})

test('isSilentMessage accepts only its own origin and the agreed type', () => {
  assert.equal(isSilentMessage({ origin: BOARD, data: { type: 'feedlog:sso-silent' } }, BOARD), true)
})

test('isSilentMessage rejects another origin', () => {
  assert.equal(isSilentMessage({ origin: 'https://evil.example', data: { type: 'feedlog:sso-silent' } }, BOARD), false)
  assert.equal(isSilentMessage({ origin: 'https://dashboard-staging.marketdata.app', data: { type: 'feedlog:sso-silent' } }, BOARD), false)
  assert.equal(isSilentMessage({ origin: 'null', data: { type: 'feedlog:sso-silent' } }, BOARD), false)
})

test('isSilentMessage rejects a missing type, another type, and a string payload', () => {
  assert.equal(isSilentMessage({ origin: BOARD, data: {} }, BOARD), false)
  assert.equal(isSilentMessage({ origin: BOARD, data: null }, BOARD), false)
  assert.equal(isSilentMessage({ origin: BOARD, data: { type: 'auth-callback' } }, BOARD), false)
  assert.equal(isSilentMessage({ origin: BOARD, data: 'feedlog:sso-silent' }, BOARD), false)
})

test('silentHandoffUrl sends the plugin back to /sso/silent on the board origin', () => {
  const url = new URL(silentHandoffUrl(PLUGIN, BOARD))
  assert.equal(url.origin + url.pathname, PLUGIN)
  assert.equal(url.searchParams.get('return_to'), `${BOARD}/sso/silent`)
})

test('the jwt handoff keeps a /sso/silent return_to on the board host, and refuses others', () => {
  const req = new IncomingMessage(new Socket())
  req.url = '/api/sso/jwt'
  req.headers = { host: 'roadmap-staging.marketdata.app' }
  const event = createEvent(req, new ServerResponse(req))
  assert.equal(validateReturnTo(event, `${BOARD}/sso/silent`), '/sso/silent')
  assert.equal(validateReturnTo(event, 'https://evil.example/sso/silent'), '/')
  assert.equal(validateReturnTo(event, '//evil.example/sso/silent'), '/')
})

test('waitForSilentMessage resolves true on a valid message from the frame', async () => {
  const target = new EventTarget()
  const frame = {}
  const pending = waitForSilentMessage({ target, ownOrigin: BOARD, source: frame, timeoutMs: 1000 })
  target.dispatchEvent(Object.assign(new Event('message'), { origin: BOARD, data: { type: SILENT_MESSAGE_TYPE }, source: frame }))
  assert.equal(await pending, true)
})

test('waitForSilentMessage ignores forged messages and times out to false', async () => {
  const target = new EventTarget()
  const frame = {}
  const pending = waitForSilentMessage({ target, ownOrigin: BOARD, source: frame, timeoutMs: 60 })
  // Wrong origin, wrong payload, and the right message from another window.
  target.dispatchEvent(Object.assign(new Event('message'), { origin: 'https://evil.example', data: { type: SILENT_MESSAGE_TYPE }, source: frame }))
  target.dispatchEvent(Object.assign(new Event('message'), { origin: BOARD, data: SILENT_MESSAGE_TYPE, source: frame }))
  target.dispatchEvent(Object.assign(new Event('message'), { origin: BOARD, data: { type: SILENT_MESSAGE_TYPE }, source: {} }))
  const started = Date.now()
  assert.equal(await pending, false)
  assert.ok(Date.now() - started >= 40)
})

// ── At most one top-level redirect per tab (sessionStorage) ────────────────

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
  }
}

test('readRedirected / markRedirected: one redirect, then remembered', () => {
  const storage = memoryStorage()
  assert.equal(readRedirected(storage), false)
  assert.equal(markRedirected(storage), true)
  assert.equal(storage.getItem('feedlog:sso-redirected'), '1')
  assert.equal(readRedirected(storage), true)
})

test('blocked storage counts as already redirected, and a mark that cannot be kept refuses the redirect', () => {
  const throwing = {
    getItem: () => { throw new Error('SecurityError') },
    setItem: () => { throw new Error('SecurityError') },
  }
  assert.equal(readRedirected(throwing), true)
  assert.equal(readRedirected(null), true)
  assert.equal(markRedirected(throwing), false)
  assert.equal(markRedirected(null), false)
  // Accepts the write but forgets it (some private modes): no proof, no redirect.
  const forgetful = { getItem: () => null, setItem: () => {} }
  assert.equal(markRedirected(forgetful), false)
})

test('the redirect loop is closed: blocked board cookies give one redirect per tab', () => {
  const storage = memoryStorage()
  const decisions: string[] = []
  // Three page loads where the board never keeps a session.
  for (let load = 0; load < 3; load++) {
    const step = decideHandoff({ amemberUser: customer, boardSession: null, redirectedThisSession: readRedirected(storage), iframeFailed: true })
    if (step === 'redirect') markRedirected(storage)
    decisions.push(step)
  }
  assert.deepEqual(decisions, ['redirect', 'none', 'none'])
})

// ── Where the handoff never runs ───────────────────────────────────────────

test('isHandoffExcludedPath: /team-login, /sso/*, the admin dashboard, with and without a locale prefix', () => {
  for (const path of ['/team-login', '/sso/silent', '/sso/error', '/dashboard', '/dashboard/settings', '/zh/team-login', '/zh/sso/silent', '/zh/dashboard/posts']) {
    assert.equal(isHandoffExcludedPath(path, ['en', 'zh']), true, path)
  }
  for (const path of ['/', '/roadmap', '/p/abc', '/zh', '/zh/p/abc', '/ssoish', '/p/team-login']) {
    assert.equal(isHandoffExcludedPath(path, ['en', 'zh']), false, path)
  }
})

// ── Frame headers: /sso/silent may be framed by the board itself only ──────

function framingRequest() {
  const app = createApp()
  app.use(defineEventHandler((event) => {
    event.context.testI18n = { locales: [{ code: 'en' }, { code: 'zh' }] }
  }))
  app.use(frameAncestors)
  app.use(defineEventHandler(() => 'page'))
  return toWebHandler(app)
}

test('frame-ancestors: /sso/silent (any locale) allows the same origin only', async () => {
  const request = framingRequest()
  for (const path of ['/sso/silent', '/sso/silent?x=1', '/zh/sso/silent']) {
    const res = await request(new Request(`${BOARD}${path}`))
    assert.equal(res.headers.get('content-security-policy'), "frame-ancestors 'self'", path)
  }
})

test('frame-ancestors: other /sso pages and look-alikes stay unframable', async () => {
  const request = framingRequest()
  for (const path of ['/sso/error', '/sso/silent/x', '/sso/silentx', '/x/sso/silent', '/', '/p/abc', '/team-login']) {
    const res = await request(new Request(`${BOARD}${path}`))
    assert.equal(res.headers.get('content-security-policy'), "frame-ancestors 'none'", path)
  }
})

// ── Final review I1: a late navigation must not lose typed text ────────────

// I1a: the frame ran out of time, but the board cookie arrived (a slow frame).
test('runHandoffFlow: the frame times out but the board cookie arrived → signed in, no redirect', async () => {
  const { deps, calls, storage } = flow({ silentHandoff: async () => { calls.push('iframe'); return false } })
  assert.equal(await runHandoffFlow(deps), 'signed-in')
  assert.deepEqual(calls, ['fetch', 'iframe', 'refresh'])
  assert.equal(storage.getItem('feedlog:sso-redirected'), null, 'the one redirect of the tab is not used up')
})

// I1b: the dashboard question has a time limit, and running out is "unknown".
function fakeResponse(status: number, body: unknown) {
  return { status, json: async () => body }
}
// A fetch that answers only when its signal aborts it (as the browser's does).
function hangingFetch(seen: { init?: { credentials?: string, signal?: AbortSignal } }) {
  return (_url: string, init: { credentials?: string, signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
    seen.init = init
    init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'TimeoutError')))
  })
}

test('the dashboard question waits 5 s at most', () => {
  assert.equal(DASHBOARD_TIMEOUT_MS, 5000)
})

test('fetchDashboardUserWith: asks with credentials and classifies the answer', async () => {
  let seenInit: { credentials?: string, signal?: AbortSignal } | undefined
  const answer = (status: number, body: unknown) => async (_url: string, init: { credentials?: string, signal?: AbortSignal }) => { seenInit = init; return fakeResponse(status, body) }
  assert.deepEqual(await fetchDashboardUserWith({ fetch: answer(200, customer), apiUrl: 'https://d/api/user/', timeoutMs: 1000 }), { kind: 'user', user: customer })
  assert.equal(seenInit?.credentials, 'include')
  assert.ok(seenInit?.signal, 'the request carries an abort signal')
  assert.deepEqual(await fetchDashboardUserWith({ fetch: answer(401, null), apiUrl: 'https://d/api/user/', timeoutMs: 1000 }), { kind: 'none' })
  const failing = async () => { throw new TypeError('Failed to fetch') }
  assert.deepEqual(await fetchDashboardUserWith({ fetch: failing, apiUrl: 'https://d/api/user/', timeoutMs: 1000 }), { kind: 'unknown' })
})

test('fetchDashboardUserWith: no answer within the limit → unknown, and the request is aborted', async () => {
  const seen: { init?: { signal?: AbortSignal } } = {}
  const started = Date.now()
  assert.deepEqual(await fetchDashboardUserWith({ fetch: hangingFetch(seen), apiUrl: 'https://d/api/user/', timeoutMs: 50 }), { kind: 'unknown' })
  const took = Date.now() - started
  assert.ok(took >= 40 && took < 1000, `took ${took} ms`)
  assert.equal(seen.init?.signal?.aborted, true)
  // A fetch that never settles, even when aborted: the limit still holds.
  const never = () => new Promise<never>(() => {})
  assert.deepEqual(await fetchDashboardUserWith({ fetch: never, apiUrl: 'https://d/api/user/', timeoutMs: 30 }), { kind: 'unknown' })
  // A body that never ends counts the same.
  const slowBody = async () => ({ status: 200, json: () => new Promise(() => {}) })
  assert.deepEqual(await fetchDashboardUserWith({ fetch: slowBody, apiUrl: 'https://d/api/user/', timeoutMs: 30 }), { kind: 'unknown' })
})

test('runHandoffFlow: a dashboard that does not answer in time signs nobody out and redirects nowhere', async () => {
  const seen = {}
  const { deps, calls } = flow({
    board: ssoA,
    fetchDashboardUser: async () => { calls.push('fetch'); return fetchDashboardUserWith({ fetch: hangingFetch(seen), apiUrl: 'https://d/api/user/', timeoutMs: 30 }) },
  })
  assert.equal(await runHandoffFlow(deps), 'unknown')
  assert.deepEqual(calls, ['fetch'])
  const visitor = flow({
    fetchDashboardUser: async () => { visitor.calls.push('fetch'); return fetchDashboardUserWith({ fetch: hangingFetch(seen), apiUrl: 'https://d/api/user/', timeoutMs: 30 }) },
  })
  assert.equal(await runHandoffFlow(visitor.deps), 'unknown')
  assert.deepEqual(visitor.calls, ['fetch'])
})

// I1c: no redirect and no reload while the visitor types, or on a page that
// has been open for a while. The next page load tries again.
test('the navigation guard: pages older than 15 s are not navigated', () => {
  assert.equal(NAVIGATION_MAX_PAGE_AGE_MS, 15_000)
})

test('isTextEntry: text inputs, textareas and contenteditable are text fields; buttons and boxes are not', () => {
  for (const type of [undefined, '', 'text', 'search', 'email', 'password', 'url', 'tel', 'number', 'TEXT']) {
    assert.equal(isTextEntry({ tagName: 'INPUT', type }), true, `input ${type}`)
  }
  assert.equal(isTextEntry({ tagName: 'input', type: 'text' }), true)
  assert.equal(isTextEntry({ tagName: 'TEXTAREA' }), true)
  assert.equal(isTextEntry({ tagName: 'DIV', isContentEditable: true }), true)
  for (const type of ['checkbox', 'radio', 'button', 'submit', 'reset', 'hidden', 'range', 'color', 'file', 'image']) {
    assert.equal(isTextEntry({ tagName: 'INPUT', type }), false, `input ${type}`)
  }
  for (const tagName of ['BUTTON', 'A', 'BODY', 'IFRAME', 'SELECT']) {
    assert.equal(isTextEntry({ tagName }), false, tagName)
  }
  assert.equal(isTextEntry(null), false)
  assert.equal(isTextEntry(undefined), false)
})

test('holdsTypedText: text the visitor typed counts; empty, server-filled and non-text fields do not', () => {
  assert.equal(holdsTypedText([]), false)
  assert.equal(holdsTypedText([{ tagName: 'INPUT', type: 'search', value: '', defaultValue: '' }]), false)
  // A search box the server filled from the URL (?q=forex) holds nothing new.
  assert.equal(holdsTypedText([{ tagName: 'INPUT', type: 'search', value: 'forex', defaultValue: 'forex' }]), false)
  assert.equal(holdsTypedText([{ tagName: 'INPUT', type: 'text', value: '   ', defaultValue: '' }]), false)
  assert.equal(holdsTypedText([{ tagName: 'INPUT', type: 'search', value: 'forex', defaultValue: '' }]), true)
  assert.equal(holdsTypedText([{ tagName: 'TEXTAREA', value: 'a draft', defaultValue: '' }]), true)
  // The comment editor (tiptap): a contenteditable with text in it.
  assert.equal(holdsTypedText([{ tagName: 'DIV', isContentEditable: true, text: 'Please add' }]), true)
  assert.equal(holdsTypedText([{ tagName: 'DIV', isContentEditable: true, text: '\n ' }]), false)
  // Checkboxes and hidden inputs carry values, not typed text.
  assert.equal(holdsTypedText([
    { tagName: 'INPUT', type: 'checkbox', value: 'on', defaultValue: '' },
    { tagName: 'INPUT', type: 'hidden', value: 'token', defaultValue: '' },
  ]), false)
})

test('mayNavigateAway: only a fresh page with no text field in use may be navigated', () => {
  const fresh = { focused: { tagName: 'BODY' }, unsavedText: false, pageAgeMs: 3000 }
  assert.equal(mayNavigateAway(fresh), true)
  assert.equal(mayNavigateAway({ ...fresh, focused: null }), true)
  assert.equal(mayNavigateAway({ ...fresh, focused: { tagName: 'BUTTON' } }), true)
  // A text field, a textarea or a contenteditable has the focus.
  assert.equal(mayNavigateAway({ ...fresh, focused: { tagName: 'INPUT', type: 'search' } }), false)
  assert.equal(mayNavigateAway({ ...fresh, focused: { tagName: 'TEXTAREA' } }), false)
  assert.equal(mayNavigateAway({ ...fresh, focused: { tagName: 'DIV', isContentEditable: true } }), false)
  // Typed text somewhere on the page, focused or not.
  assert.equal(mayNavigateAway({ ...fresh, unsavedText: true }), false)
  // The page has been open longer than 15 s.
  assert.equal(mayNavigateAway({ ...fresh, pageAgeMs: 15_000 }), true)
  assert.equal(mayNavigateAway({ ...fresh, pageAgeMs: 15_001 }), false)
  assert.equal(mayNavigateAway({ ...fresh, pageAgeMs: Number.NaN }), false)
})

test('runHandoffFlow: the fallback redirect is skipped while the guard says no, and the tab keeps its one redirect', async () => {
  const { deps, calls, storage } = flow({ afterHandoffBoard: null, silentHandoff: async () => { calls.push('iframe'); return false }, mayNavigate: () => false })
  assert.equal(await runHandoffFlow(deps), 'deferred')
  assert.deepEqual(calls, ['fetch', 'iframe', 'refresh'])
  assert.equal(storage.getItem('feedlog:sso-redirected'), null)
})

// Fix 2 (re-review, security): the guard never keeps a session the dashboard
// disagrees with. The sign-out is a request, not a navigation: it always runs.
// Only the reload, and the handoff to the new account, wait.
test('runHandoffFlow: guarded logout sync → the board session still ends, read in place, no reload', async () => {
  const { deps, calls } = flow({ board: ssoA, dashboard: { kind: 'none' }, mayNavigate: () => false })
  assert.equal(await runHandoffFlow(deps), 'signed-out')
  assert.deepEqual(calls, ['fetch', 'signout', 'refresh'])
})

test('runHandoffFlow: guarded account switch → the old account is signed out, no handoff for the new one, no reload', async () => {
  const { deps, calls, storage } = flow({ board: ssoA, mayNavigate: () => false })
  assert.equal(await runHandoffFlow(deps), 'deferred')
  assert.deepEqual(calls, ['fetch', 'signout', 'refresh'])
  assert.equal(storage.getItem('feedlog:sso-redirected'), null)
})

test('runHandoffFlow: a planted session cannot hide behind typed text (pre-filled composer, switch)', async () => {
  // A sign-in link for account A with return_to=/?new=1&title=x opens the
  // composer with a title: the guard says no from the start. A must still end.
  let board: { ssoOrgId: string | null, email: string | null } | null = ssoA
  const { deps, calls } = flow({
    boardSession: () => board,
    mayNavigate: () => false,
    signOutBoard: async () => { calls.push('signout'); board = null; return true },
    refreshInPlace: async () => { calls.push('refresh') },
  })
  assert.equal(await runHandoffFlow(deps), 'deferred')
  assert.equal(board, null, 'account A is signed out')
  assert.ok(!calls.includes('iframe') && !calls.includes('after-signout'))
})

test('runHandoffFlow: guarded switch whose sign-out fails stops there', async () => {
  const { deps, calls } = flow({ board: ssoA, mayNavigate: () => false, signOutBoard: async () => { calls.push('signout'); return false } })
  assert.equal(await runHandoffFlow(deps), 'failed')
  assert.deepEqual(calls, ['fetch', 'signout'])
})

test('runHandoffFlow: guarded switch cancelled during the sign-out → nothing more', async () => {
  const controller = new AbortController()
  const { deps, calls } = flow({
    board: ssoA,
    mayNavigate: () => false,
    signal: controller.signal,
    signOutBoard: async () => { calls.push('signout'); controller.abort(); return true },
  })
  assert.equal(await runHandoffFlow(deps), 'cancelled')
  assert.deepEqual(calls, ['fetch', 'signout'])
})

test('runHandoffFlow: the in-page sign-in needs no navigation, so the guard does not stop it', async () => {
  const { deps, calls } = flow({ mayNavigate: () => false })
  assert.equal(await runHandoffFlow(deps), 'signed-in')
  assert.deepEqual(calls, ['fetch', 'iframe', 'refresh'])
})

test('runHandoffFlow: the visitor starts typing during the logout sign-out → the empty session is read in place, no reload', async () => {
  let allowed = true
  const { deps, calls } = flow({
    board: ssoA,
    dashboard: { kind: 'none' },
    mayNavigate: () => allowed,
    signOutBoard: async () => { calls.push('signout'); allowed = false; return true },
  })
  assert.equal(await runHandoffFlow(deps), 'signed-out')
  assert.deepEqual(calls, ['fetch', 'signout', 'refresh'])
})

test('runHandoffFlow: a switch that cannot finish while the visitor types → signed out in place, no reload', async () => {
  const storage = memoryStorage()
  markRedirected(storage)
  let allowed = true
  const { deps, calls } = flow({
    board: ssoA,
    storage,
    afterHandoffBoard: null,
    mayNavigate: () => allowed,
    silentHandoff: async () => { calls.push('iframe'); allowed = false; return false },
  })
  assert.equal(await runHandoffFlow(deps), 'failed')
  assert.deepEqual(calls, ['fetch', 'signout', 'iframe', 'refresh'])
})

// I1d: the layout unmounted (the flow is cancelled): nothing more happens.
test('runHandoffFlow: cancelled while the dashboard answers → no sign-out, no frame', async () => {
  const controller = new AbortController()
  const { deps, calls } = flow({
    board: ssoA,
    signal: controller.signal,
    fetchDashboardUser: async () => { calls.push('fetch'); controller.abort(); return { kind: 'none' } },
  })
  assert.equal(await runHandoffFlow(deps), 'cancelled')
  assert.deepEqual(calls, ['fetch'])
})

test('runHandoffFlow: cancelled during the frame → no refresh, no redirect, the mark untouched', async () => {
  const controller = new AbortController()
  const { deps, calls, storage } = flow({
    afterHandoffBoard: null,
    signal: controller.signal,
    silentHandoff: async () => { calls.push('iframe'); controller.abort(); return false },
  })
  assert.equal(await runHandoffFlow(deps), 'cancelled')
  assert.deepEqual(calls, ['fetch', 'iframe'])
  assert.equal(storage.getItem('feedlog:sso-redirected'), null)
})

test('runHandoffFlow: cancelled during the frame refresh → no redirect', async () => {
  const controller = new AbortController()
  const { deps, calls } = flow({
    signal: controller.signal,
    silentHandoff: async () => { calls.push('iframe'); return false },
    refreshInPlace: async () => { calls.push('refresh'); controller.abort() },
    boardSession: () => null,
  })
  assert.equal(await runHandoffFlow(deps), 'cancelled')
  assert.deepEqual(calls, ['fetch', 'iframe', 'refresh'])
})

test('runHandoffFlow: cancelled during the logout sign-out → no reload', async () => {
  const controller = new AbortController()
  const { deps, calls } = flow({
    board: ssoA,
    dashboard: { kind: 'none' },
    signal: controller.signal,
    signOutBoard: async () => { calls.push('signout'); controller.abort(); return true },
  })
  assert.equal(await runHandoffFlow(deps), 'cancelled')
  assert.deepEqual(calls, ['fetch', 'signout'])
})

test('runHandoffFlow: cancelled during the switch sign-out → no frame', async () => {
  const controller = new AbortController()
  const { deps, calls } = flow({
    board: ssoA,
    signal: controller.signal,
    signOutBoard: async () => { calls.push('signout'); controller.abort(); return true },
  })
  assert.equal(await runHandoffFlow(deps), 'cancelled')
  assert.deepEqual(calls, ['fetch', 'signout'])
})

test('waitForSilentMessage: a cancel resolves false at once', async () => {
  const controller = new AbortController()
  const pending = waitForSilentMessage({ target: new EventTarget(), ownOrigin: BOARD, source: {}, timeoutMs: 5000, signal: controller.signal })
  const started = Date.now()
  controller.abort()
  assert.equal(await pending, false)
  assert.ok(Date.now() - started < 1000)
  // Already cancelled before the wait starts.
  assert.equal(await waitForSilentMessage({ target: new EventTarget(), ownOrigin: BOARD, source: {}, timeoutMs: 5000, signal: controller.signal }), false)
})

test('fetchDashboardUserWith: a cancel ends the question at once as unknown', async () => {
  const controller = new AbortController()
  const seen: { init?: { signal?: AbortSignal } } = {}
  const pending = fetchDashboardUserWith({ fetch: hangingFetch(seen), apiUrl: 'https://d/api/user/', timeoutMs: 5000, signal: controller.signal })
  const started = Date.now()
  controller.abort()
  assert.deepEqual(await pending, { kind: 'unknown' })
  assert.ok(Date.now() - started < 1000)
  assert.equal(seen.init?.signal?.aborted, true)
})
