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
import { MAUTIC_TEMPLATE, MAUTIC_TEMPLATE_SHA256 } from '../server/utils/email-template-mautic'
import { createHash } from 'node:crypto'

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
    assert.match(mail.html, /Market Data/, typeKey)
    assert.match(mail.html, /If you have any questions, write to/, typeKey)
    assert.match(mail.text, /Market Data/, typeKey)
  }
})

// The layout of Market Data's own customer emails (Mautic, 2026-10-31).
const allEmails = (): Record<string, string> => {
  const out: Record<string, string> = { ...accountEmails }
  for (const typeKey of ['post.status_changed', 'post.admin_replied', 'post.created', 'post.user_commented'])
    out[typeKey] = renderNotificationEmail({ typeKey, postTitle: 'IV', postUrl: url, preferencesUrl: `${url}/prefs`, to: 'done', note: 'Shipped', snippet: 'x', actorName: 'Max' })!.html
  return out
}

test('every email is the Mautic template: logo, #003286 button, the current footer, no slot left', () => {
  for (const [name, html] of Object.entries(allEmails())) {
    assert.ok(html.startsWith(MAUTIC_TEMPLATE.slice(0, MAUTIC_TEMPLATE.indexOf('<title>'))), `${name}: the template head`)
    assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}|<!--\/?OPTIONAL:/, `${name}: a slot or block marker is left`)
    assert.match(html, /marketdatalogo1\.png/, name)
    if (name !== 'passwordSet') assert.match(html, /background:#003286;border-width:0px;display:inline-block;border-radius:6px/, `${name}: the Market Data button`)
    else assert.doesNotMatch(html, /class="ch"/, `${name}: no button`)
    assert.match(html, /Montevideo 126, Buenos Aires \(1019\), Argentina/, name)
    assert.match(html, new RegExp(`Market Data © ${new Date().getUTCFullYear()}\\. All Rights Reserved\\.`), name)
    assert.match(html, /https:\/\/x\.com\/MarketDataApp/, name)
    assert.doesNotMatch(html, /t\.me\/|twitter\.com/, `${name}: no Telegram, no twitter.com (selden, 2026-10-30)`)
    assert.doesNotMatch(html, /max-circle|max-signature/, `${name}: no sign-off as Max (selden, 2026-10-31)`)
    assert.match(html, /support@marketdata\.app/, name)
  }
})

test('the footer reason line fits the kind of email', () => {
  const mails = allEmails()
  // The password emails go only to the team login: customers have no roadmap password.
  for (const name of ['verification', 'reset', 'passwordSet']) {
    assert.match(mails[name]!, /because you manage the Market Data roadmap\./, name)
    assert.match(mails[name]!, /team login/, name)
  }
  for (const name of ['post.status_changed', 'post.admin_replied'])
    assert.match(mails[name]!, /because you follow this request on our roadmap\./, name)
  for (const name of ['post.created', 'post.user_commented'])
    assert.match(mails[name]!, /because you manage the Market Data roadmap\./, name)
})

test('a follower stops updates on the request page; a team member gets the notification settings', () => {
  const follow = renderNotificationEmail({ typeKey: 'post.status_changed', postTitle: 'IV', postUrl: url, to: 'planned' })!
  assert.match(follow.html, new RegExp(`href="${url}"[^>]*>Stop updates for this request<`))
  assert.match(follow.text, /Stop updates for this request: https:\/\/roadmap-staging/)
  // The stop link has its own line, under the reason line (selden 2026-10-31), in HTML and in text.
  assert.match(follow.html, new RegExp(`on our roadmap\\.<br><a href="${url}"[^>]*>Stop updates for this request</a>\\.`))
  assert.match(follow.text, /on our roadmap\.\nStop updates for this request: /)
  const team = renderNotificationEmail({ typeKey: 'post.created', postTitle: 'IV', postUrl: url, preferencesUrl: `${url}/prefs`, snippet: 'x', actorName: 'Ann' })!
  assert.match(team.html, />Manage email notifications</)
  assert.doesNotMatch(team.html, /Stop updates for this request/)
})

test('a status note shows as a note from the team, escaped', () => {
  const mail = renderNotificationEmail({ typeKey: 'post.status_changed', postTitle: '<b>IV</b>', postUrl: url, to: 'done', note: 'Live <script>' })!
  assert.match(mail.html, /A note from the Market Data team/)
  assert.match(mail.html, /Live &lt;script&gt;/)
  assert.match(mail.html, /&lt;b&gt;IV&lt;\/b&gt;/)
  assert.doesNotMatch(mail.html, /<script>/)
  assert.match(mail.text, /A note from the Market Data team:\nLive <script>/)
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

test('customers get only status emails: no comment notifies subscribers (selden, 2026-10-31)', async () => {
  const { resolveCommentEvents } = await import('../shared/utils/notifications')
  for (const isTopLevel of [true, false])
    for (const authorIsAdmin of [true, false])
      assert.deepEqual(resolveCommentEvents({ isTopLevel, authorIsAdmin }), [], `top=${isTopLevel} admin=${authorIsAdmin}`)
})

test('the Mautic template module is intact (generated, sha256 of its source)', () => {
  assert.equal(createHash('sha256').update(MAUTIC_TEMPLATE, 'utf8').digest('hex'), MAUTIC_TEMPLATE_SHA256)
})

test('button labels are in capitals, as in every Mautic transactional email', () => {
  const mail = renderNotificationEmail({ typeKey: 'post.status_changed', postTitle: 'IV', postUrl: url, to: 'planned' })!
  assert.match(mail.html, />VIEW THE REQUEST<\/a>/)
  assert.match(renderResetPasswordEmail({ url, name: 'Max' }), />RESET PASSWORD<\/a>/)
})
