import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'

// MarketData: customers sign in through aMember (product SSO), so the only
// email/password account is the board admin's. Email sign-up and password reset
// are open only to an address in SYSTEM_ADMIN_EMAILS; sign-in stays open.

// Exact match against the comma list, case-insensitive. An unset or empty list
// matches nobody.
export function isSystemAdminEmail(email: string, systemAdminEmails: string | undefined): boolean {
  const wanted = email.trim().toLowerCase()
  if (!wanted || !systemAdminEmails) return false
  return systemAdminEmails
    .split(',')
    .map(s => s.trim().toLowerCase())
    .some(s => s && s === wanted)
}

// Email sign-up is open only to the admin list.
export function isSignupAllowed(email: string, systemAdminEmails: string | undefined): boolean {
  return isSystemAdminEmail(email, systemAdminEmails)
}

// better-auth's own reply to a reset request, for an address it knows and for
// one it does not (routes/password.mjs, 1.7.6). A refused address gets these
// same bytes, so the reply tells nobody which addresses exist.
const RESET_REQUESTED_REPLY = {
  status: true,
  message: 'If this email exists in our system, check your email for the reset link',
}

// Before hooks on better-auth's own routes, so the rules hold for any client,
// not only the forms. The list is read per request.
//
// Password reset: a reset token for an account without a password makes
// better-auth create one (/reset-password), so a reset mail to a customer would
// give that customer a password login, and anyone could send reset mails to any
// address. Only the admin list gets a mail; the admin's reset also works for an
// importer-created owner that has no password yet.
export function signupAllowlist(): BetterAuthPlugin {
  const bodyEmail = (body: unknown) => {
    const email = (body as { email?: unknown } | undefined)?.email
    return typeof email === 'string' ? email : ''
  }
  return {
    id: 'marketdata-signup-allowlist',
    hooks: {
      before: [
        {
          matcher: context => context.path === '/sign-up/email',
          handler: createAuthMiddleware(async (context) => {
            if (!isSignupAllowed(bodyEmail(context.body), process.env.SYSTEM_ADMIN_EMAILS)) {
              throw new APIError('FORBIDDEN', {
                message: 'Sign-up is closed. Sign in with your MarketData account.',
                code: 'SIGNUP_NOT_ALLOWED',
              })
            }
          }),
        },
        {
          matcher: context => context.path === '/request-password-reset',
          handler: createAuthMiddleware(async (context) => {
            if (!isSystemAdminEmail(bodyEmail(context.body), process.env.SYSTEM_ADMIN_EMAILS)) {
              return context.json({ ...RESET_REQUESTED_REPLY })
            }
          }),
        },
      ],
    },
  }
}
