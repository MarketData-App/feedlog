// Sign-in through the customer's own product (MarketData: the aMember
// feedlog-sso plugin). That page signs the visitor in, then sends them back to
// /api/sso/jwt with a signed token and the same return_to, so they land on the
// page they started from.
export function buildSsoLoginUrl(loginUrl: string, currentUrl: string): string {
  const separator = loginUrl.includes('?') ? '&' : '?'
  return `${loginUrl}${separator}return_to=${encodeURIComponent(currentUrl)}`
}

// What a sign-in prompt does.
// - No SSO login URL: open the in-page modal (upstream FeedLog behaviour).
// - A plain sign-in: go to the SSO login URL, then come back here.
// - A prompt for a direct (non-SSO) sign-in: show a notice, never a form. The
//   SSO login only hands back another SSO session, and a customer has no
//   password here: profile and password live in the customer's own account.
export type SignInAction =
  | { kind: 'modal' }
  | { kind: 'redirect', url: string }
  | { kind: 'notice' }

export function signInAction(
  loginUrl: string | null | undefined,
  currentUrl: string,
  needsDirectSignIn: boolean,
): SignInAction {
  if (!loginUrl) return { kind: 'modal' }
  if (needsDirectSignIn) return { kind: 'notice' }
  return { kind: 'redirect', url: buildSsoLoginUrl(loginUrl, currentUrl) }
}
