// Email sending abstraction — Registry pattern
// Auto-imported by Nitro, available in all server/ code
import { filterAllowedRecipients, recipientDomain } from './email-allowlist'

export interface SendEmailOptions {
  to: string
  idempotencyKey?: string
  subject: string
  html: string
  text?: string
  headers?: Record<string, string> // custom headers, e.g. List-Unsubscribe (RFC 8058)
}

export interface EmailProvider {
  name: string
  send(options: SendEmailOptions): Promise<void>
}

// The From header for outgoing mail. EMAIL_FROM is either a bare address
// ("noreply@example.com", shown as "Market Data Roadmap <...>") or a full header
// value ("Market Data Roadmap <roadmap@contact.marketdata.app>"), which is kept as
// it is: wrapping it again gives "Name <Name <addr>>" and Resend refuses that.
// MarketData: the fallback display name is the board's sender name, not FeedLog.
const FROM_DISPLAY_NAME = 'Market Data Roadmap'
const FALLBACK_FROM_ADDRESS = 'onboarding@resend.dev'

export function formatEmailFrom(emailFrom: string | undefined): string {
  const value = (emailFrom ?? '').trim()
  if (/<[^<>\s]+@[^<>\s]+>$/.test(value)) return value
  return `${FROM_DISPLAY_NAME} <${value || FALLBACK_FROM_ADDRESS}>`
}

// --- Registry ---
const providers = new Map<string, EmailProvider>()

export function registerEmailProvider(provider: EmailProvider) {
  providers.set(provider.name, provider)
}

export function resolveEmailProvider(): EmailProvider {
  const preferred = process.env.EMAIL_PROVIDER

  // 1. Explicitly specified provider
  if (preferred && providers.has(preferred))
    return providers.get(preferred)!

  // 2. Fallback by priority
  for (const name of ['resend', 'console']) {
    if (providers.has(name)) return providers.get(name)!
  }

  throw new Error('No email provider registered')
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  // Defense-in-depth: a subject is a single header line, so collapse any CR/LF —
  // a subject carrying user data (post title, org name) can't inject extra headers.
  const subject = options.subject.replace(/[\r\n]+/g, ' ')
  // Every send path (auth, notifications, invitations, inbox) ends here, so the
  // EMAIL_ALLOWED_DOMAINS allowlist is applied once, before any provider runs.
  const { send, dropped } = filterAllowedRecipients(options.to, process.env.EMAIL_ALLOWED_DOMAINS)
  if (dropped.length > 0) {
    // Log the count and the domains only, never the addresses.
    const domains = [...new Set(dropped.map(recipientDomain))].join(',')
    console.warn(`[email] Email dropped by EMAIL_ALLOWED_DOMAINS count=${dropped.length} domains=${domains}`)
  }
  if (send.length === 0) return
  await resolveEmailProvider().send({ ...options, to: send[0]!, subject })
}
