import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { filterAllowedRecipients } from '../server/utils/email-allowlist'
import { registerEmailProvider, sendEmail } from '../server/utils/email'

const ALLOWED = 'resend.dev,marketdata.app'

test('keeps an allowed recipient', () => {
  assert.deepEqual(filterAllowedRecipients('a@resend.dev', ALLOWED), { send: ['a@resend.dev'], dropped: [] })
})

test('splits allowed and dropped recipients, case-insensitive', () => {
  assert.deepEqual(filterAllowedRecipients(['x@gmail.com', 'B@MarketData.app'], ALLOWED), {
    send: ['B@MarketData.app'],
    dropped: ['x@gmail.com'],
  })
})

test('matches the domain exactly, no suffix or subdomain match', () => {
  assert.deepEqual(filterAllowedRecipients('x@evil-marketdata.app', 'marketdata.app').send, [])
  assert.deepEqual(filterAllowedRecipients('x@evil-marketdata.app', 'marketdata.app').dropped, ['x@evil-marketdata.app'])
  assert.deepEqual(filterAllowedRecipients('x@sub.marketdata.app', 'marketdata.app').send, [])
  assert.deepEqual(filterAllowedRecipients('x@marketdata.app@gmail.com', 'marketdata.app').send, [])
})

test('no filtering when the list is empty or undefined', () => {
  assert.deepEqual(filterAllowedRecipients('x@gmail.com', undefined), { send: ['x@gmail.com'], dropped: [] })
  assert.deepEqual(filterAllowedRecipients('x@gmail.com', ''), { send: ['x@gmail.com'], dropped: [] })
  assert.deepEqual(filterAllowedRecipients('x@gmail.com', ' , '), { send: ['x@gmail.com'], dropped: [] })
})

test('tolerates spaces and case in the allowed list', () => {
  assert.deepEqual(filterAllowedRecipients('a@Resend.dev', ' Resend.dev , marketdata.app ').send, ['a@Resend.dev'])
})

test('sendEmail sends only to allowlisted domains', async () => {
  const sent: string[] = []
  registerEmailProvider({ name: 'test-capture', send: async o => { sent.push(o.to) } })
  const saved = { p: process.env.EMAIL_PROVIDER, a: process.env.EMAIL_ALLOWED_DOMAINS }
  process.env.EMAIL_PROVIDER = 'test-capture'
  process.env.EMAIL_ALLOWED_DOMAINS = ALLOWED
  try {
    await sendEmail({ to: 'customer@gmail.com', subject: 's', html: '<p>x</p>' })
    await sendEmail({ to: 'ok@marketdata.app', subject: 's', html: '<p>x</p>' })
    assert.deepEqual(sent, ['ok@marketdata.app'])
  } finally {
    if (saved.p === undefined) delete process.env.EMAIL_PROVIDER; else process.env.EMAIL_PROVIDER = saved.p
    if (saved.a === undefined) delete process.env.EMAIL_ALLOWED_DOMAINS; else process.env.EMAIL_ALLOWED_DOMAINS = saved.a
  }
})
