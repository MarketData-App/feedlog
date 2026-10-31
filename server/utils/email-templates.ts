// Email HTML templates — auto-imported by Nitro.
import { STATUS_CONFIG } from '../../shared/types/post'

// MarketData: every email uses the layout of Market Data's own customer emails
// (the Stripo layout in Mautic, sent to us by the marketing agent on 2026-10-31):
// a white 600px card on #FAFAFA, the logo and the text menu, Arial #333333, the
// #003286 button, and the newsletter footer (social icons, copyright, address,
// Website / Privacy / Terms, a reason line). No sign-off as Max (selden,
// 2026-10-31): every email signs as the Market Data Team. Replies to the sender
// address are not read, so the emails point to the support address instead.
// EMAIL_BOARD_NAME matches the board's page title ("<org> Feedback").
export const EMAIL_BRAND = 'Market Data'
export const EMAIL_BOARD_NAME = 'Market Data Feedback'
const SUPPORT_EMAIL = 'support@marketdata.app'
const SITE_URL = 'https://www.marketdata.app'
const FONT_STACK = `arial, 'helvetica neue', helvetica, sans-serif`
const TEXT = '#333333'
const MUTED = '#666666'
const FAINT = '#999999'
const RULE = '#CCCCCC'
const PAGE = '#FAFAFA'
const BUTTON = '#003286'
const LINK = '#5C68E2'
const LOGO_URL = 'https://marketing.marketdata.app/marketdata/media/images/logos/marketdatalogo1.png'
const MENU: Array<[string, string]> = [
  ['Sheets', `${SITE_URL}/sheets-addon/`],
  ['API', `${SITE_URL}/docs/api`],
  ['Docs', `${SITE_URL}/docs/`],
  ['Tutorials', `${SITE_URL}/tutorials/`],
]
const SOCIAL_ICONS = 'https://marketing.marketdata.app/marketdata/media/images/social'
const SOCIAL: Array<[string, string, string]> = [
  ['Facebook', 'https://www.facebook.com/MarketDataApp/', `${SOCIAL_ICONS}/facebook-logo-black.png`],
  ['X', 'https://x.com/MarketDataApp', 'https://uuuhiq.stripocdn.email/content/assets/img/social-icons/logo-black/x-logo-black.png'],
  ['Instagram', 'https://www.instagram.com/marketdata.app/', `${SOCIAL_ICONS}/instagram-logo-black.png`],
  ['YouTube', 'https://www.youtube.com/channel/UCtMeqaVWugbYyCYIAKlyC6Q', `${SOCIAL_ICONS}/youtube-logo-black.png`],
  ['Reddit', 'https://www.reddit.com/r/MarketDataApp/', `${SOCIAL_ICONS}/reddit-logo-black.png`],
  ['Discord', 'https://discord.gg/GmdeAVRtnT', `${SOCIAL_ICONS}/discord-logo-black.png`],
]
const ADDRESS = 'Montevideo 126, Buenos Aires (1019), Argentina'

// The reason line of the footer, one per kind of email (selden, 2026-10-31).
export const REASON_FOLLOW = 'You received this email because you follow this request on our roadmap.'
export const REASON_ACCOUNT = 'You received this email because you have an account on the Market Data roadmap.'
export const REASON_TEAM = 'You received this email because you manage the Market Data roadmap.'
const REASON_INVITE = 'You received this email because the Market Data team invited you to manage its roadmap.'

export function renderInboxReplyEmail({ reply, productName, topic, url }: { reply: string; productName: string; topic: string; url?: string }) {
  const intro = topic ? `You have a reply about ${topic} from ${productName}.` : `You have a reply from ${productName}.`
  const hint = `Open the support chat in ${productName} to reply.`
  const text = [intro, reply, url ? `Continue conversation: ${url}` : '', hint].filter(Boolean).join('\n\n')
  return { text, html: layout({ preheader: intro, reason: REASON_ACCOUNT, content: `${paragraph(escapeHtml(intro))}<p style="${P_STYLE} white-space: pre-wrap;">${escapeHtml(reply)}</p>${url ? actionButton(escapeHtml(url), 'Continue conversation') : ''}${paragraph(escapeHtml(hint))}` }) }
}

const P_STYLE = `margin: 0 0 14px; font-family: ${FONT_STACK}; font-size: 14px; line-height: 21px; color: ${TEXT};`

function paragraph(html: string): string {
  return `<p style="${P_STYLE}">${html}</p>`
}

function heading(text: string): string {
  return `<h3 style="margin: 0 0 16px; font-family: ${FONT_STACK}; font-size: 20px; line-height: 24px; font-weight: bold; color: ${TEXT};">${text}</h3>`
}

function textLink(url: string, label: string): string {
  return `<a href="${url}" style="color: ${LINK}; text-decoration: underline;">${label}</a>`
}

// The shared chrome: logo, menu, the content card, the sign-off, the footer.
// `unsubscribe` is the last footer link (a request page or the notification settings).
function shell({ preheader, content, reason, unsubscribe }: { preheader: string; content: string; reason: string; unsubscribe?: { url: string; label: string } }): string {
  const menu = MENU.map(([label, url]) => `<a href="${url}" style="font-family: ${FONT_STACK}; font-size: 14px; color: ${TEXT}; text-decoration: none; padding: 0 12px;">${label}</a>`).join('')
  const social = SOCIAL.map(([label, url, icon]) => `<a href="${url}" style="text-decoration: none; padding: 0 6px;"><img src="${icon}" width="24" height="24" alt="${label}" title="${label}" style="border: 0; display: inline-block; vertical-align: middle;"></a>`).join('')
  const small = `margin: 0 0 6px; font-family: ${FONT_STACK}; font-size: 12px; line-height: 18px; color: ${FAINT};`
  const footerLink = (url: string, label: string) => `<a href="${url}" style="color: ${FAINT}; text-decoration: underline;">${label}</a>`
  return `
<div style="margin: 0; padding: 0; background: ${PAGE};">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: ${PAGE};">
    <tr><td align="center" style="padding: 20px 10px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; background: #FFFFFF;">
        <tr><td align="center" style="padding: 24px 20px 12px;">
          <a href="${SITE_URL}/" style="text-decoration: none;"><img src="${LOGO_URL}" width="200" alt="${EMAIL_BRAND}" style="display: block; border: 0; width: 200px; max-width: 100%; height: auto;"></a>
        </td></tr>
        <tr><td align="center" style="padding: 8px 20px 18px; border-bottom: 1px solid ${RULE};">${menu}</td></tr>
        <tr><td align="left" style="padding: 30px 40px 10px; font-family: ${FONT_STACK}; font-size: 14px; line-height: 21px; color: ${TEXT};">
${content}
        </td></tr>
        <tr><td align="left" style="padding: 10px 40px 30px;">
          <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 14px; line-height: 21px; color: ${TEXT};">The ${EMAIL_BRAND} Team</p>
          <p style="margin: 6px 0 0; font-family: ${FONT_STACK}; font-size: 12px; line-height: 18px; color: ${MUTED};">Questions? Write to ${textLink(`mailto:${SUPPORT_EMAIL}`, SUPPORT_EMAIL)}.</p>
        </td></tr>
      </table>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px;">
        <tr><td align="center" style="padding: 24px 20px 10px;">${social}</td></tr>
        <tr><td align="center" style="padding: 0 20px 20px;">
          <p style="${small}">${EMAIL_BRAND} &copy; ${new Date().getUTCFullYear()}. All Rights Reserved.</p>
          <p style="${small}">${ADDRESS}</p>
          <p style="${small}">${footerLink(`${SITE_URL}/`, 'Website')} &nbsp;&middot;&nbsp; ${footerLink(`${SITE_URL}/privacy/`, 'Privacy')} &nbsp;&middot;&nbsp; ${footerLink(`${SITE_URL}/terms/`, 'Terms')}</p>
          <p style="${small}">${reason}</p>
          ${unsubscribe ? `<p style="${small}">${footerLink(escapeHtml(unsubscribe.url), unsubscribe.label)}</p>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>`
}

// The account emails (verification, invitation, password).
function layout({ preheader, content, reason }: { preheader: string; content: string; reason: string }): string {
  return shell({ preheader, content, reason })
}

function actionButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 10px 0 14px;"><tr><td style="background: ${BUTTON}; border-radius: 6px;">
  <a href="${url}" style="display: inline-block; padding: 10px 30px; font-family: ${FONT_STACK}; font-size: 20px; line-height: 24px; color: #FFFFFF; text-decoration: none; border-radius: 6px;">${label}</a>
</td></tr></table>`
}

function fallbackLink(url: string): string {
  const shown = url.length <= 80 ? url : `${url.slice(0, 80)}...`
  return `
<p style="margin: 14px 0 4px; font-family: ${FONT_STACK}; font-size: 12px; line-height: 18px; color: ${MUTED};">Button not working? Paste this link into your browser:</p>
<p style="margin: 0 0 14px; font-family: ${FONT_STACK}; font-size: 12px; line-height: 18px; word-break: break-all;">${textLink(url, shown)}</p>
`
}

function expiryNote(text: string): string {
  return `<p style="margin: 0 0 14px; font-family: ${FONT_STACK}; font-size: 12px; line-height: 18px; color: ${MUTED};">${text}</p>`
}

// --- Templates ---

export function renderVerificationEmail({ url, name }: { url: string; name: string }): string {
  return layout({
    preheader: 'One click to activate · link expires in 1 hour.',
    reason: REASON_ACCOUNT,
    content: `
${heading('Confirm your email to get started')}
${paragraph(`Hi ${escapeHtml(name)},`)}
${paragraph(`Confirm your email to activate your account on the ${EMAIL_BRAND} roadmap. Then you can:`)}
<ul style="margin: 0 0 14px; padding-left: 20px; font-family: ${FONT_STACK}; font-size: 14px; line-height: 21px; color: ${TEXT};">
  <li style="margin-bottom: 4px;">Vote on the features you care about</li>
  <li style="margin-bottom: 4px;">Send us requests and ideas</li>
  <li>Follow what we build next</li>
</ul>
${actionButton(url, 'Confirm email')}
${fallbackLink(url)}
${expiryNote(`This link expires in 1 hour. If you did not sign up on the ${EMAIL_BRAND} roadmap, you can ignore this email.`)}
`,
  })
}

export function renderInvitationEmail({ url, orgName }: { url: string; orgName: string }): string {
  return layout({
    preheader: `You're invited to join ${escapeHtml(orgName)} on the feedback board.`,
    reason: REASON_INVITE,
    content: `
${heading(`Join ${escapeHtml(orgName)} on the roadmap`)}
${paragraph('You are invited to help manage the roadmap. Click the button to accept:')}
${actionButton(url, 'Accept invitation')}
${fallbackLink(url)}
${expiryNote('This invitation link works only with your email address. If you did not expect it, you can ignore this email.')}
`,
  })
}

export function renderResetPasswordEmail({ url, name }: { url: string; name: string }): string {
  return layout({
    preheader: 'A password reset was requested for your account. If it wasn\'t you, ignore this email.',
    reason: REASON_ACCOUNT,
    content: `
${heading('Reset your password')}
${paragraph(`Hi ${escapeHtml(name)},`)}
${paragraph(`Somebody asked to reset the password of your account on the ${EMAIL_BRAND} roadmap. If this was you, click the button to set a new password:`)}
${actionButton(url, 'Reset password')}
${fallbackLink(url)}
${expiryNote('This link expires in 1 hour and works only once.')}
${paragraph('<strong>Did not ask for this?</strong> You can ignore this email. Your password does not change unless you click the link.')}
`,
  })
}

export function renderPasswordSetEmail({ name }: { name: string }): string {
  return layout({
    preheader: 'If this wasn\'t you, reset your password immediately.',
    reason: REASON_ACCOUNT,
    content: `
${heading('A password was added to your account')}
${paragraph(`Hi ${escapeHtml(name)},`)}
${paragraph(`A password was added to your account on the ${EMAIL_BRAND} roadmap. You can now also sign in with your email and this password.`)}
${paragraph(`If this was not you, reset your password now and write to ${textLink(`mailto:${SUPPORT_EMAIL}`, SUPPORT_EMAIL)}.`)}
`,
  })
}

// --- Notification templates (English only) ---

// User-authored text (titles, notes, comment snippets) enters the HTML body
// here, so every interpolation is escaped.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export interface NotificationEmailContent {
  subject: string
  html: string
  text: string
}

function centeredButton(url: string, label: string): string {
  return `<div style="text-align: center; margin-top: 24px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;"><tr><td style="background: ${BUTTON}; border-radius: 6px;">
  <a href="${url}" style="display: inline-block; padding: 10px 30px; font-family: ${FONT_STACK}; font-size: 20px; line-height: 24px; color: #FFFFFF; text-decoration: none; border-radius: 6px;">${label}</a>
</td></tr></table></div>`
}

function statusChangeCard(title: string, to: string, note?: string): NotificationEmailContent {
  const cfg = STATUS_CONFIG[to as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.open
  const label = cfg.label
  // The note shows as a quote from the team, with no photo or personal sign-off.
  const noteHtml = note
    ? `<div style="margin: 20px 0 0; padding: 12px 16px; background: ${PAGE}; border-left: 3px solid ${BUTTON};">
        <p style="margin: 0 0 6px; font-family: ${FONT_STACK}; font-size: 12px; line-height: 18px; color: ${MUTED}; font-weight: bold;">A note from the ${EMAIL_BRAND} team</p>
        <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 14px; line-height: 21px; color: ${TEXT}; white-space: pre-wrap;">${escapeHtml(note)}</p>
      </div>`
    : ''
  const inner = `
      ${heading('Your request has an update')}
      <p style="${P_STYLE}">A request that you follow, <strong>${escapeHtml(title)}</strong>, is now <span style="color: ${cfg.color}; font-weight: bold;">${label}</span>.</p>${noteHtml}
      ${centeredButton('{{postUrl}}', 'View the request')}`
  return {
    subject: `${label} - "${title}"`,
    html: inner,
    text: `A request that you follow, ${title}, is now ${label}.${note ? `\n\nA note from the ${EMAIL_BRAND} team:\n${note}` : ''}`,
  }
}

function personCard(title: string, actorName: string, actorImage: string | null | undefined, snippet: string, buttonLabel: string): string {
  const initial = (actorName || '?').charAt(0).toUpperCase()
  // Only trust an http(s) URL as a src; anything else falls back to the initial avatar.
  const safeImage = actorImage && /^https?:\/\//i.test(actorImage) ? actorImage : null
  const avatar = safeImage
    ? `<img src="${escapeHtml(safeImage)}" width="40" height="40" style="border-radius: 999px; display: block;" alt="">`
    : `<div style="width: 40px; height: 40px; border-radius: 999px; background: ${BUTTON}; color: #FFFFFF; font-family: ${FONT_STACK}; font-size: 16px; font-weight: bold; text-align: center; line-height: 40px;">${escapeHtml(initial)}</div>`
  return `
      ${heading(escapeHtml(title))}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%;"><tr>
        <td width="52" valign="top">${avatar}</td>
        <td valign="top">
          <div style="font-family: ${FONT_STACK}; font-size: 14px; font-weight: bold; color: ${TEXT}; margin-bottom: 4px;">${escapeHtml(actorName)}</div>
          <div style="font-family: ${FONT_STACK}; font-size: 14px; line-height: 21px; color: ${MUTED}; white-space: pre-wrap;">${escapeHtml(snippet)}</div>
        </td>
      </tr></table>
      ${centeredButton('{{postUrl}}', buttonLabel)}`
}

function adminReplyCard(title: string, actorName: string, actorImage: string | null | undefined, snippet: string): NotificationEmailContent {
  return {
    subject: `New comment for "${title}"`,
    html: personCard(title, actorName, actorImage, snippet, 'View the comment'),
    text: `${actorName} commented on "${title}":\n\n${snippet}`,
  }
}

function newFeedbackCard(title: string, actorName: string, actorImage: string | null | undefined, snippet: string): NotificationEmailContent {
  return {
    subject: `New feedback: "${title}"`,
    html: personCard(title, actorName, actorImage, snippet, 'View the request'),
    text: `${actorName} submitted new feedback, "${title}":\n\n${snippet}`,
  }
}

function userCommentCard(title: string, actorName: string, actorImage: string | null | undefined, snippet: string): NotificationEmailContent {
  return {
    subject: `New reply on "${title}"`,
    html: personCard(title, actorName, actorImage, snippet, 'View the comment'),
    text: `${actorName} replied on "${title}":\n\n${snippet}`,
  }
}

// Dispatch a notification to its template. Returns null for an unknown type so
// the caller logs it rather than sending a blank email. `brandColor` is still
// accepted from the callers; the email uses the Market Data email button colour.
export function renderNotificationEmail(input: {
  typeKey: string
  postTitle?: string
  postUrl: string
  preferencesUrl?: string
  to?: string
  note?: string
  snippet?: string
  actorName?: string
  actorImage?: string | null
  brandColor?: string
}): NotificationEmailContent | null {
  const title = input.postTitle || 'your post'
  let card: NotificationEmailContent | null = null
  let preheader = ''
  let reason = REASON_FOLLOW

  switch (input.typeKey) {
    case 'post.status_changed': {
      const label = (STATUS_CONFIG[(input.to ?? 'open') as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.open).label
      card = statusChangeCard(title, input.to ?? 'open', input.note)
      preheader = `"${title}" is now ${label}.`
      break
    }
    case 'post.admin_replied':
      card = adminReplyCard(title, input.actorName ?? 'The team', input.actorImage, input.snippet ?? '')
      preheader = `An official reply on "${title}".`
      break
    case 'post.created':
      card = newFeedbackCard(title, input.actorName ?? 'Someone', input.actorImage, input.snippet ?? '')
      preheader = `New feedback on your board: "${title}".`
      reason = REASON_TEAM
      break
    case 'post.user_commented':
      card = userCommentCard(title, input.actorName ?? 'Someone', input.actorImage, input.snippet ?? '')
      preheader = `A new reply on "${title}".`
      reason = REASON_TEAM
      break
    default:
      return null
  }

  // A follower stops the updates on the request page (its Subscribe button); a
  // team member manages them in the notification settings.
  const team = reason === REASON_TEAM
  const unsubscribe = team
    ? (input.preferencesUrl ? { url: input.preferencesUrl, label: 'Manage email notifications' } : undefined)
    : { url: input.postUrl, label: 'Stop updates for this request' }
  const html = shell({ preheader, reason, unsubscribe, content: card.html.replaceAll('{{postUrl}}', escapeHtml(input.postUrl)) })
  const text = `${card.text}\n\nView: ${input.postUrl}\n\nThe ${EMAIL_BRAND} Team\nQuestions? Write to ${SUPPORT_EMAIL}.\n\n—\n${reason}${unsubscribe ? `\n${unsubscribe.label}: ${unsubscribe.url}` : ''}`
  return { subject: card.subject, html, text }
}
