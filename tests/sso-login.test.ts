import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createServer } from 'node:http'
import { createApp, createError, createEvent, createRouter, defineEventHandler, getHeaders, readBody, toNodeListener } from 'h3'
import { SignJWT } from 'jose'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

// server/utils is written against Nitro's auto-imports.
Object.assign(globalThis, { createError })

const { buildSsoLoginUrl, signInAction } = await import('../app/utils/sso-login-url')
const { isReservedEmail, validateReturnTo, verifySsoJwt } = await import('../server/utils/sso')
const { isSignupAllowed, signupAllowlist } = await import('../server/utils/signup-allowlist')

const BOARD_HOST = 'roadmap-staging.marketdata.app'

function eventOn(host: string) {
  const req = new IncomingMessage(new Socket())
  req.url = '/api/sso/jwt'
  req.headers = { host }
  return createEvent(req, new ServerResponse(req))
}

test('buildSsoLoginUrl appends the encoded current URL as return_to', () => {
  assert.equal(
    buildSsoLoginUrl('https://dash.example/misc/feedlog-sso', 'https://roadmap-staging.marketdata.app/p/abc?x=1'),
    'https://dash.example/misc/feedlog-sso?return_to=https%3A%2F%2Froadmap-staging.marketdata.app%2Fp%2Fabc%3Fx%3D1',
  )
})

test('buildSsoLoginUrl joins with & when the login URL already has a query', () => {
  const url = buildSsoLoginUrl('https://dash.example/x?a=b', 'https://roadmap-staging.marketdata.app/')
  assert.ok(url.includes('?a=b&return_to='), url)
  assert.equal(url, 'https://dash.example/x?a=b&return_to=https%3A%2F%2Froadmap-staging.marketdata.app%2F')
})

test('signInAction redirects a sign-in to the SSO login URL when one is set', () => {
  const here = 'https://roadmap-staging.marketdata.app/p/abc'
  assert.deepEqual(signInAction('https://dash.example/sso', here, false), { kind: 'redirect', url: buildSsoLoginUrl('https://dash.example/sso', here) })
})

test('signInAction opens the modal only when no SSO login URL is set', () => {
  const here = 'https://roadmap-staging.marketdata.app/'
  for (const url of ['', undefined, null]) {
    assert.deepEqual(signInAction(url, here, false), { kind: 'modal' })
    assert.deepEqual(signInAction(url, here, true), { kind: 'modal' })
  }
})

test('signInAction shows a notice, never a form, for a direct sign-in in SSO mode', () => {
  // An SSO login only hands back another SSO session, and a customer has no
  // password: profile and password live in the MarketData account.
  assert.deepEqual(signInAction('https://dash.example/sso', 'https://roadmap-staging.marketdata.app/', true), { kind: 'notice' })
})

test('isReservedEmail is true for a .invalid domain, case-insensitive', () => {
  assert.equal(isReservedEmail('canny-ab@import.invalid'), true)
  assert.equal(isReservedEmail('A@Foo.INVALID'), true)
  assert.equal(isReservedEmail('a@invalid.com'), false)
  assert.equal(isReservedEmail('a@marketdata.app'), false)
  assert.equal(isReservedEmail('anon-1@feedlog.invalid'), true)
})

test('validateReturnTo never returns a path that starts with //', () => {
  const event = eventOn(BOARD_HOST)
  assert.equal(validateReturnTo(event, `https://${BOARD_HOST}/.//evil.example`), '/')
  assert.equal(validateReturnTo(event, '/.//evil.example'), '/')
  assert.equal(validateReturnTo(event, '/././/evil.example/x?y=1'), '/')
  assert.equal(validateReturnTo(event, '//evil.example'), '/')
  assert.equal(validateReturnTo(event, 'https://evil.example/p/abc'), '/')
})

test('validateReturnTo keeps a same-host target', () => {
  const event = eventOn(BOARD_HOST)
  assert.equal(validateReturnTo(event, `https://${BOARD_HOST}/p/abc?x=1#c`), '/p/abc?x=1#c')
  assert.equal(validateReturnTo(event, '/p/abc?x=1'), '/p/abc?x=1')
  assert.equal(validateReturnTo(event, undefined), '/')
})

test('verifySsoJwt refuses a reserved .invalid email like a bad email', async () => {
  const secret = 'test-secret-0123456789abcdef0123456789abcdef'
  const sign = (email: string) => new SignJWT({ email, name: 'X' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret))

  const ok = await verifySsoJwt(await sign('Customer@MarketData.app'), [secret])
  assert.equal(ok.email, 'customer@marketdata.app')

  for (const email of ['canny-ab@import.invalid', 'A@Foo.INVALID', 'not-an-email']) {
    await assert.rejects(verifySsoJwt(await sign(email), [secret]), (err: { statusCode?: number, message?: string }) => {
      assert.equal(err.statusCode, 400)
      assert.equal(err.message, 'SSO token must carry a valid email claim')
      return true
    }, email)
  }
})

test('verifySsoJwt refuses an email in SYSTEM_ADMIN_EMAILS like a bad email', async () => {
  const secret = 'test-secret-0123456789abcdef0123456789abcdef'
  const sign = (email: string) => new SignJWT({ email, name: 'X' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret))
  const saved = process.env.SYSTEM_ADMIN_EMAILS
  process.env.SYSTEM_ADMIN_EMAILS = 'other@x.com, max@marketdata.app'
  try {
    for (const email of ['max@marketdata.app', 'MAX@MarketData.App', ' max@marketdata.app ']) {
      await assert.rejects(verifySsoJwt(await sign(email), [secret]), (err: { statusCode?: number, message?: string }) => {
        assert.equal(err.statusCode, 400)
        assert.equal(err.message, 'SSO token must carry a valid email claim')
        return true
      }, email)
    }
    assert.equal((await verifySsoJwt(await sign('customer@marketdata.app'), [secret])).email, 'customer@marketdata.app')
  }
  finally {
    if (saved === undefined) delete process.env.SYSTEM_ADMIN_EMAILS
    else process.env.SYSTEM_ADMIN_EMAILS = saved
  }
})

test('isSignupAllowed matches the admin list exactly, case-insensitive', () => {
  assert.equal(isSignupAllowed('Admin@X.com', 'admin@x.com,b@y.com'), true)
  assert.equal(isSignupAllowed('b@y.com', ' admin@x.com , B@Y.com '), true)
  assert.equal(isSignupAllowed('c@x.com', 'admin@x.com'), false)
  assert.equal(isSignupAllowed('c@x.com', undefined), false)
  assert.equal(isSignupAllowed('c@x.com', ''), false)
  assert.equal(isSignupAllowed('admin@x.com.evil', 'admin@x.com'), false)
  assert.equal(isSignupAllowed('', 'admin@x.com'), false)
})

test('the better-auth sign-up endpoint refuses an email not in SYSTEM_ADMIN_EMAILS', async () => {
  const saved = process.env.SYSTEM_ADMIN_EMAILS
  process.env.SYSTEM_ADMIN_EMAILS = 'max@marketdata.app'
  try {
    const auth = betterAuth({
      baseURL: 'http://localhost:3000',
      secret: 'test-better-auth-secret-0123456789abcdef',
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      emailAndPassword: { enabled: true, sendResetPassword: async () => {} },
      plugins: [signupAllowlist()],
      logger: { disabled: true },
    })
    const post = (path: string, body: Record<string, unknown>) => auth.handler(new Request(`http://localhost:3000/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(body),
    }))

    const refused = await post('/sign-up/email', { name: 'P', email: 'probe@example.com', password: 'password-1234' })
    assert.equal(refused.status, 403)
    assert.equal((await refused.json()).code, 'SIGNUP_NOT_ALLOWED')

    const admin = await post('/sign-up/email', { name: 'Max', email: 'Max@MarketData.app', password: 'password-1234' })
    assert.equal(admin.status, 200)

    // Sign-in and password reset stay open.
    const signIn = await post('/sign-in/email', { email: 'max@marketdata.app', password: 'password-1234' })
    assert.equal(signIn.status, 200)
    const reset = await post('/request-password-reset', { email: 'max@marketdata.app', redirectTo: '/reset-password' })
    assert.equal(reset.status, 200)
  }
  finally {
    if (saved === undefined) delete process.env.SYSTEM_ADMIN_EMAILS
    else process.env.SYSTEM_ADMIN_EMAILS = saved
  }
})

test('password reset mails only SYSTEM_ADMIN_EMAILS, with the same reply for everyone', async () => {
  const saved = process.env.SYSTEM_ADMIN_EMAILS
  process.env.SYSTEM_ADMIN_EMAILS = 'max@marketdata.app'
  const mails: { email: string, token: string }[] = []
  // An importer-created owner: a user row with no credential account. A
  // customer and a placeholder exist too.
  const now = new Date()
  const user = (id: string, email: string) => ({ id, email, name: id, emailVerified: true, createdAt: now, updatedAt: now })
  const db = {
    user: [user('u-admin', 'max@marketdata.app'), user('u-customer', 'customer@example.com'), user('u-placeholder', 'canny-ab@import.invalid')],
    session: [], account: [], verification: [],
  }
  try {
    const auth = betterAuth({
      baseURL: 'http://localhost:3000',
      secret: 'test-better-auth-secret-0123456789abcdef',
      database: memoryAdapter(db),
      emailAndPassword: {
        enabled: true,
        sendResetPassword: async ({ user, token }) => { mails.push({ email: user.email, token }) },
      },
      plugins: [signupAllowlist()],
      logger: { disabled: true },
    })
    const post = (path: string, body: Record<string, unknown>) => auth.handler(new Request(`http://localhost:3000/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(body),
    }))
    const requestReset = async (email: string) => {
      const res = await post('/request-password-reset', { email, redirectTo: '/reset-password' })
      return { status: res.status, body: await res.json() }
    }

    const admin = await requestReset('Max@MarketData.app')
    assert.equal(admin.status, 200)
    assert.deepEqual(mails.map(m => m.email), ['max@marketdata.app'])

    // Existing customer, placeholder, unknown address: no mail, no token, and
    // the reply is the admin's reply, byte for byte.
    for (const email of ['customer@example.com', 'canny-ab@import.invalid', 'probe-1@example.com']) {
      const denied = await requestReset(email)
      assert.equal(denied.status, admin.status, email)
      assert.deepEqual(denied.body, admin.body, email)
    }
    assert.equal(mails.length, 1)
    assert.equal(db.verification.length, 1)

    // The admin's token gives the owner a password login (better-auth creates
    // the credential account), and sign-in then works.
    const reset = await post('/reset-password', { token: mails[0]!.token, newPassword: 'new-password-1234' })
    assert.equal(reset.status, 200)
    const signIn = await post('/sign-in/email', { email: 'max@marketdata.app', password: 'new-password-1234' })
    assert.equal(signIn.status, 200)
  }
  finally {
    if (saved === undefined) delete process.env.SYSTEM_ADMIN_EMAILS
    else process.env.SYSTEM_ADMIN_EMAILS = saved
  }
})

test('set-password refuses an SSO or guest session before it touches the account', async () => {
  const calls: string[] = []
  const { requireLocalSession } = await import('../server/utils/auth')
  Object.assign(globalThis, {
    defineEventHandler, readBody, getHeaders, requireLocalSession,
    auth: { api: {
      getSession: async ({ headers }: { headers: Headers | Record<string, string> }) => {
        const identity = new Headers(headers as HeadersInit).get('x-test-session')
        if (!identity) return null
        return {
          user: { id: 'u1', email: 'u1@example.com', name: 'U1', isAnonymous: identity === 'guest' },
          session: { ssoOrgId: identity === 'sso' ? 'org-1' : null },
        }
      },
      listUserAccounts: async () => { calls.push('listUserAccounts'); return [] },
      setPassword: async () => { calls.push('setPassword'); return { status: true } },
    } },
    sendEmail: async () => { calls.push('sendEmail') },
    renderPasswordSetEmail: () => '',
  })
  const handler = (await import('../server/api/auth/set-password.post')).default
  const app = createApp()
  app.use(defineEventHandler((event) => { event.context.orgId = 'org-1' }))
  app.use(createRouter().post('/api/auth/set-password', handler))
  const server = createServer(toNodeListener(app))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  const setPassword = async (identity: string) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/set-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(identity && { 'x-test-session': identity }) },
      body: JSON.stringify({ newPassword: 'password-1234' }),
    })
    return { status: res.status, body: await res.json() as { data?: { code?: string } } }
  }
  try {
    const sso = await setPassword('sso')
    assert.equal(sso.status, 403)
    assert.equal(sso.body.data?.code, 'LOCAL_AUTH_REQUIRED')
    assert.equal((await setPassword('guest')).status, 403)
    assert.equal((await setPassword('')).status, 401)
    assert.deepEqual(calls, [])

    const local = await setPassword('local')
    assert.equal(local.status, 200)
    assert.deepEqual(calls, ['listUserAccounts', 'setPassword', 'sendEmail'])
  }
  finally {
    server.close()
  }
})
