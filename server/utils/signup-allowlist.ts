import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'

// MarketData: customers sign in through aMember (product SSO), so the only
// email/password account is the board admin's. Email sign-up is open only to an
// address in SYSTEM_ADMIN_EMAILS; sign-in and password reset stay open.

// Exact match against the comma list, case-insensitive. An unset or empty list
// allows nobody.
export function isSignupAllowed(email: string, systemAdminEmails: string | undefined): boolean {
  const wanted = email.trim().toLowerCase()
  if (!wanted || !systemAdminEmails) return false
  return systemAdminEmails
    .split(',')
    .map(s => s.trim().toLowerCase())
    .some(s => s && s === wanted)
}

// A before hook on better-auth's own route, so the refusal holds for any
// client, not only the sign-up form. The list is read per request.
export function signupAllowlist(): BetterAuthPlugin {
  return {
    id: 'marketdata-signup-allowlist',
    hooks: {
      before: [{
        matcher: context => context.path === '/sign-up/email',
        handler: createAuthMiddleware(async (context) => {
          const email = typeof context.body?.email === 'string' ? context.body.email : ''
          if (!isSignupAllowed(email, process.env.SYSTEM_ADMIN_EMAILS)) {
            throw new APIError('FORBIDDEN', {
              message: 'Sign-up is closed. Sign in with your MarketData account.',
              code: 'SIGNUP_NOT_ALLOWED',
            })
          }
        }),
      }],
    },
  }
}
