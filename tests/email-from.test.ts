import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { formatEmailFrom } from '../server/utils/email'

// EMAIL_FROM may be a bare address or a full "Name <address>" header value.
// A full value must reach Resend unchanged: wrapping it again gives
// "FeedLog <Name <address>>", which Resend refuses with 422.

test('keeps a full "Name <address>" value as it is', () => {
  assert.equal(
    formatEmailFrom('MarketData Roadmap <roadmap@contact.marketdata.app>'),
    'MarketData Roadmap <roadmap@contact.marketdata.app>',
  )
  assert.equal(formatEmailFrom('  Team <a@b.example>  '), 'Team <a@b.example>')
})

test('adds the FeedLog display name to a bare address', () => {
  assert.equal(formatEmailFrom('noreply@example.com'), 'FeedLog <noreply@example.com>')
  assert.equal(formatEmailFrom(' noreply@example.com '), 'FeedLog <noreply@example.com>')
})

test('falls back to the Resend onboarding sender when unset or empty', () => {
  assert.equal(formatEmailFrom(undefined), 'FeedLog <onboarding@resend.dev>')
  assert.equal(formatEmailFrom(''), 'FeedLog <onboarding@resend.dev>')
  assert.equal(formatEmailFrom('   '), 'FeedLog <onboarding@resend.dev>')
})
