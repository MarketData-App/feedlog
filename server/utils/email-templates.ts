// Email HTML templates — auto-imported by Nitro.
import { STATUS_CONFIG } from '../../shared/types/post'
import { MAUTIC_TEMPLATE } from './email-template-mautic'

// MarketData: every email is the Market Data transactional template exactly as
// Mautic holds it (email 37 with the footer of email 48; email-template-mautic.ts,
// generated). Only its slots change. Defaults of email 37 for the open choices
// (2026-10-31): the reason line in #333333, the Stripo logo URL, no sign-off; the
// support line is ordinary closing text. Replies to the sender address are not
// read, so the emails point to the support address instead of "reply to this email".
// Board-only parts (the status, a note, a commenter) are plain template text.
// EMAIL_BOARD_NAME matches the board's page title ("<org> Feedback").
export const EMAIL_BRAND = 'Market Data'
export const EMAIL_BOARD_NAME = 'Market Data Feedback'
const SUPPORT_EMAIL = 'support@marketdata.app'

// The reason line of the footer, one per kind of email (selden, 2026-10-31).
// Customers never get a password email: they sign in only through aMember, and
// sign-up, password reset and set-password are open only to the team login
// (SYSTEM_ADMIN_EMAILS; see signup-allowlist.ts). So the password emails speak
// to the team login and carry the team reason line.
export const REASON_FOLLOW = 'You received this email because you follow this request on our roadmap.'
export const REASON_ACCOUNT = 'You received this email because you have an account on the Market Data roadmap.'
export const REASON_TEAM = 'You received this email because you manage the Market Data roadmap.'
const REASON_INVITE = 'You received this email because the Market Data team invited you to manage its roadmap.'

// The template's own paragraph and link styles (transactional-template.md, section 5).
const P_STYLE = `Margin:0;-webkit-text-size-adjust:none;-ms-text-size-adjust:none;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;color:#333333;font-size:14px`
const A_STYLE = `-webkit-text-size-adjust:none;-ms-text-size-adjust:none;mso-line-height-rule:exactly;text-decoration:underline;color:#5C68E2;font-size:14px`

// User-authored text (titles, notes, comment snippets) enters the HTML body
// here, so every interpolation is escaped.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function p(html: string): string {
  return `<p style="${P_STYLE}">${html}</p>`
}

// The paragraphs have no margin: a gap is one empty paragraph, as in email 37.
const GAP = `<p style="${P_STYLE}"><br></p>`

function paragraphs(...items: string[]): string {
  return items.filter(Boolean).map(p).join(GAP)
}

function link(url: string, label: string): string {
  return `<a target="_blank" href="${url}" style="${A_STYLE}">${label}</a>`
}

// Escaped user text, line breaks kept.
function userText(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, '<br>')
}

const SUPPORT_LINE = `If you have any questions, write to ${link(`mailto:${SUPPORT_EMAIL}`, SUPPORT_EMAIL)}.`

interface EmailParts {
  title: string
  preheader: string
  heading: string // plain text
  body: string // HTML paragraphs
  closing?: string // HTML paragraphs above the button
  button?: { url: string; label: string; keepCase?: boolean }
  afterButton?: string // HTML paragraphs below the button
  reason: string
  unsubscribe?: { url: string; label: string }
}

// Fill the template: keep or drop each optional block, then set every slot.
function render(parts: EmailParts): string {
  const keep = new Set<string>([
    ...(parts.closing ? ['CLOSING'] : []),
    ...(parts.button ? ['BUTTON'] : []),
    ...(parts.afterButton ? ['AFTER_BUTTON'] : []),
    ...(parts.unsubscribe ? ['UNSUBSCRIBE'] : []),
  ])
  const slots: Record<string, string> = {
    TITLE: escapeHtml(parts.title),
    PREHEADER: escapeHtml(parts.preheader),
    HEADING: escapeHtml(parts.heading),
    BODY: parts.body,
    CLOSING: parts.closing ?? '',
    BUTTON_URL: parts.button ? escapeHtml(parts.button.url) : '',
    // Mautic writes every button label in capitals, in the text.
    // (The inbox reply keeps upstream's label: Market Data does not use the inbox.)
    BUTTON_LABEL: parts.button ? escapeHtml(parts.button.keepCase ? parts.button.label : parts.button.label.toUpperCase()) : '',
    AFTER_BUTTON: parts.afterButton ?? '',
    YEAR: String(new Date().getUTCFullYear()),
    REASON_LINE: escapeHtml(parts.reason),
    UNSUBSCRIBE_URL: parts.unsubscribe ? escapeHtml(parts.unsubscribe.url) : '',
    UNSUBSCRIBE_LABEL: parts.unsubscribe ? escapeHtml(parts.unsubscribe.label) : '',
    ICON_URL: '',
    TRACKING_PIXEL: '',
  }
  return MAUTIC_TEMPLATE
    .replace(/<!--OPTIONAL:([A-Z_]+)-->([\s\S]*?)<!--\/OPTIONAL:\1-->/g, (_m, name: string, inner: string) => keep.has(name) ? inner : '')
    .replace(/\{\{([A-Z_]+)\}\}/g, (_m, key: string) => slots[key] ?? '')
}

function fallbackLink(url: string): string {
  const shown = url.length <= 80 ? url : `${url.slice(0, 80)}...`
  return paragraphs(`Button not working? Paste this link into your browser:<br>${link(url, escapeHtml(shown))}`)
}

export function renderInboxReplyEmail({ reply, productName, topic, url }: { reply: string; productName: string; topic: string; url?: string }) {
  const intro = topic ? `You have a reply about ${topic} from ${productName}.` : `You have a reply from ${productName}.`
  const hint = `Open the support chat in ${productName} to reply.`
  const text = [intro, reply, url ? `Continue conversation: ${url}` : '', hint].filter(Boolean).join('\n\n')
  return {
    text,
    html: render({
      title: intro,
      preheader: intro,
      heading: `A reply from ${productName}`,
      body: paragraphs(escapeHtml(intro), userText(reply)),
      closing: GAP + p(escapeHtml(hint)),
      button: url ? { url, label: 'Continue conversation', keepCase: true } : undefined,
      reason: REASON_ACCOUNT,
    }),
  }
}

// --- Account templates (the team login only; see the reason lines above) ---

export function renderVerificationEmail({ url, name }: { url: string; name: string }): string {
  return render({
    title: 'Confirm the email of your team login',
    preheader: 'Confirm the email of your team login · the link expires in 1 hour.',
    heading: 'Confirm the email of your team login',
    body: paragraphs(`Hi ${escapeHtml(name)},`, `Confirm this email to finish your team login for the ${EMAIL_BRAND} roadmap (the board admin).`),
    closing: GAP + p(SUPPORT_LINE),
    button: { url, label: 'Confirm email' },
    afterButton: fallbackLink(url) + GAP + p('This link expires in 1 hour. If you did not make a team login, you can ignore this email. Customers sign in with their Market Data account and have no roadmap password.'),
    reason: REASON_TEAM,
  })
}

export function renderInvitationEmail({ url, orgName }: { url: string; orgName: string }): string {
  return render({
    title: `Join ${orgName} on the roadmap`,
    preheader: `You're invited to join ${orgName} on the feedback board.`,
    heading: `Join ${orgName} on the roadmap`,
    body: paragraphs(`You are invited to help manage the ${EMAIL_BRAND} roadmap. Click the button to accept.`),
    closing: GAP + p(SUPPORT_LINE),
    button: { url, label: 'Accept invitation' },
    afterButton: fallbackLink(url) + GAP + p('This invitation link works only with your email address. If you did not expect it, you can ignore this email.'),
    reason: REASON_INVITE,
  })
}

export function renderResetPasswordEmail({ url, name }: { url: string; name: string }): string {
  return render({
    title: 'Reset the password of your team login',
    preheader: 'A password reset was requested for your account. If it wasn\'t you, ignore this email.',
    heading: 'Reset the password of your team login',
    body: paragraphs(`Hi ${escapeHtml(name)},`, `Somebody asked to reset the password of your team login for the ${EMAIL_BRAND} roadmap. If this was you, click the button to set a new password.`),
    closing: GAP + p(SUPPORT_LINE),
    button: { url, label: 'Reset password' },
    afterButton: fallbackLink(url) + GAP + paragraphs('This link expires in 1 hour and works only once.', '<strong>Did not ask for this?</strong> You can ignore this email. Your password does not change unless you click the link.'),
    reason: REASON_TEAM,
  })
}

export function renderPasswordSetEmail({ name }: { name: string }): string {
  return render({
    title: 'A password was added to your team login',
    preheader: 'If this wasn\'t you, reset your password immediately.',
    heading: 'A password was added to your team login',
    body: paragraphs(
      `Hi ${escapeHtml(name)},`,
      `A password was added to your team login for the ${EMAIL_BRAND} roadmap. You can now sign in at the team login with your email and this password.`,
      `If this was not you, reset your password now and write to ${link(`mailto:${SUPPORT_EMAIL}`, SUPPORT_EMAIL)}.`,
    ),
    reason: REASON_TEAM,
  })
}

// --- Notification templates (English only) ---

export interface NotificationEmailContent {
  subject: string
  html: string
  text: string
}

interface Card {
  subject: string
  heading: string
  body: string
  buttonLabel: string
  text: string
}

function statusChangeCard(title: string, to: string, note?: string): Card {
  const label = (STATUS_CONFIG[to as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.open).label
  const body = paragraphs(
    `A request that you follow, <strong>${escapeHtml(title)}</strong>, is now <strong>${label}</strong>.`,
    note ? `<strong>A note from the ${EMAIL_BRAND} team:</strong><br>${userText(note)}` : '',
  )
  return {
    subject: `${label} - "${title}"`,
    heading: 'Your request has an update',
    body,
    buttonLabel: 'View the request',
    text: `A request that you follow, ${title}, is now ${label}.${note ? `\n\nA note from the ${EMAIL_BRAND} team:\n${note}` : ''}`,
  }
}

function personCard(subject: string, title: string, intro: string, snippet: string, buttonLabel: string, text: string): Card {
  return { subject, heading: title, body: paragraphs(intro, userText(snippet)), buttonLabel, text }
}

// Dispatch a notification to its template. Returns null for an unknown type so
// the caller logs it rather than sending a blank email. `brandColor` and
// `actorImage` are still accepted from the callers; the template has no place
// for a colour or an avatar.
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
  const actor = escapeHtml(input.actorName ?? 'Someone')
  let card: Card
  let preheader = ''
  let reason = REASON_FOLLOW

  switch (input.typeKey) {
    case 'post.status_changed': {
      card = statusChangeCard(title, input.to ?? 'open', input.note)
      const label = (STATUS_CONFIG[(input.to ?? 'open') as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.open).label
      preheader = `"${title}" is now ${label}.`
      break
    }
    case 'post.admin_replied': {
      const name = escapeHtml(input.actorName ?? 'The team')
      card = personCard(`New comment for "${title}"`, title, `<strong>${name}</strong> commented:`, input.snippet ?? '', 'View the comment',
        `${input.actorName ?? 'The team'} commented on "${title}":\n\n${input.snippet ?? ''}`)
      preheader = `An official reply on "${title}".`
      break
    }
    case 'post.created':
      card = personCard(`New feedback: "${title}"`, title, `<strong>${actor}</strong> sent a new request:`, input.snippet ?? '', 'View the request',
        `${input.actorName ?? 'Someone'} submitted new feedback, "${title}":\n\n${input.snippet ?? ''}`)
      preheader = `New feedback on your board: "${title}".`
      reason = REASON_TEAM
      break
    case 'post.user_commented':
      card = personCard(`New reply on "${title}"`, title, `<strong>${actor}</strong> replied:`, input.snippet ?? '', 'View the comment',
        `${input.actorName ?? 'Someone'} replied on "${title}":\n\n${input.snippet ?? ''}`)
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
  const html = render({
    title: card.subject,
    preheader,
    heading: card.heading,
    body: card.body,
    closing: GAP + p(SUPPORT_LINE),
    button: { url: input.postUrl, label: card.buttonLabel },
    reason,
    unsubscribe,
  })
  const text = `${card.text}\n\nView: ${input.postUrl}\n\nIf you have any questions, write to ${SUPPORT_EMAIL}.\n\n—\n${EMAIL_BRAND}\n${reason}${unsubscribe ? `\n${unsubscribe.label}: ${unsubscribe.url}` : ''}`
  return { subject: card.subject, html, text }
}
