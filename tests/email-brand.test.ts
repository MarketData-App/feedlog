import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  renderInvitationEmail,
  renderNotificationEmail,
  renderPasswordSetEmail,
  renderResetPasswordEmail,
  renderVerificationEmail,
} from '../server/utils/email-templates'
import { formatEmailFrom } from '../server/utils/email'

// MarketData: no email names FeedLog or gives FeedLog's contact details.

const FEEDLOG = /feedlog/i
const url = 'https://roadmap-staging.marketdata.app/x'

const accountEmails: Record<string, string> = {
  verification: renderVerificationEmail({ url, name: 'Ann' }),
  invitation: renderInvitationEmail({ url, orgName: 'Market Data' }),
  reset: renderResetPasswordEmail({ url, name: 'Ann' }),
  passwordSet: renderPasswordSetEmail({ name: 'Ann' }),
}

test('the account emails do not name FeedLog', () => {
  for (const [name, html] of Object.entries(accountEmails)) assert.doesNotMatch(html, FEEDLOG, name)
})

test('the account emails sign as Market Data, with the Market Data support address', () => {
  for (const name of ['verification', 'invitation', 'reset', 'passwordSet']) {
    assert.match(accountEmails[name]!, /Market Data/, name)
    assert.match(accountEmails[name]!, /support@marketdata\.app/, name)
  }
})

test('the notification emails do not name FeedLog, and show the Market Data name', () => {
  for (const typeKey of ['post.status_changed', 'post.admin_replied', 'post.created', 'post.user_commented']) {
    const mail = renderNotificationEmail({
      typeKey,
      postTitle: 'Implied Volatility',
      postUrl: url,
      preferencesUrl: `${url}/prefs`,
      to: 'planned',
      snippet: 'A comment',
      actorName: 'Max',
      brandColor: '#1447E6',
    })
    assert.ok(mail, typeKey)
    assert.doesNotMatch(`${mail.subject}\n${mail.html}\n${mail.text}`, FEEDLOG, typeKey)
    assert.match(mail.html, />Market Data</, typeKey)
    assert.match(mail.text, /Market Data/, typeKey)
  }
})

test('no email subject in the server names FeedLog', () => {
  for (const file of [
    'server/utils/better-auth.ts',
    'server/api/auth/set-password.post.ts',
    'server/api/admin/invitations/[id]/resend.post.ts',
    'server/lib/inbox/scheduler.ts',
  ]) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    const subjects = [...src.matchAll(/subject: ([`'"])(.*?)\1/g)].map(m => m[2]!)
    assert.ok(subjects.length > 0, file)
    for (const subject of subjects) assert.doesNotMatch(subject, FEEDLOG, `${file}: ${subject}`)
  }
})

test('the fallback sender name is not FeedLog', () => {
  assert.doesNotMatch(formatEmailFrom('noreply@example.com'), FEEDLOG)
  assert.doesNotMatch(formatEmailFrom(undefined), FEEDLOG)
})
