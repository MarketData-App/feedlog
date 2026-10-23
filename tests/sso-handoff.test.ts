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
  HANDOFF_TIMEOUT_MS,
  SILENT_MESSAGE_TYPE,
  SILENT_PATH,
  SSO_REDIRECTED_KEY,
  boardSessionFor,
  buildLoginHref,
  classifyUserResponse,
  decideHandoff,
  isEndpointLink,
  isHandoffExcludedPath,
  isSilentMessage,
  markRedirected,
  readRedirected,
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
  // A redirect earlier in this browser session does not stop a silent try.
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

test('boardSessionFor: keeps the ssoOrgId marker, null for a local session', () => {
  assert.deepEqual(boardSessionFor({ user: { id: 'u' }, session: { ssoOrgId: 'org-1' } }), { ssoOrgId: 'org-1' })
  assert.deepEqual(boardSessionFor({ user: { id: 'u' }, session: { ssoOrgId: null } }), { ssoOrgId: null })
  assert.deepEqual(boardSessionFor({ user: { id: 'u' }, session: {} }), { ssoOrgId: null })
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

// ── At most one top-level redirect per browser session ─────────────────────

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

test('the redirect loop is closed: blocked board cookies give one redirect per browser session', () => {
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
