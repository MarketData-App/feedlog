import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createError, createEvent } from 'h3'
import { SignJWT } from 'jose'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

// server/utils is written against Nitro's auto-imports.
Object.assign(globalThis, { createError })

const { buildSsoLoginUrl, ssoLoginTarget } = await import('../app/utils/sso-login-url')
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

test('ssoLoginTarget sends a sign-in to the SSO login URL only when one is set', () => {
  const here = 'https://roadmap-staging.marketdata.app/p/abc'
  assert.equal(ssoLoginTarget('https://dash.example/sso', here, false), buildSsoLoginUrl('https://dash.example/sso', here))
  assert.equal(ssoLoginTarget('', here, false), null)
  assert.equal(ssoLoginTarget(undefined, here, false), null)
  assert.equal(ssoLoginTarget(null, here, false), null)
})

test('ssoLoginTarget keeps the modal for a prompt that needs a direct sign-in', () => {
  // An SSO login only hands back another SSO session, which cannot satisfy it.
  assert.equal(ssoLoginTarget('https://dash.example/sso', 'https://roadmap-staging.marketdata.app/', true), null)
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
