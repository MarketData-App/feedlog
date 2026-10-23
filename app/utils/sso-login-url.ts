// Sign-in through the customer's own product (MarketData: the aMember
// feedlog-sso plugin). That page signs the visitor in, then sends them back to
// /api/sso/jwt with a signed token and the same return_to, so they land on the
// page they started from.
export function buildSsoLoginUrl(loginUrl: string, currentUrl: string): string {
  const separator = loginUrl.includes('?') ? '&' : '?'
  return `${loginUrl}${separator}return_to=${encodeURIComponent(currentUrl)}`
}

// Where a sign-in prompt goes: the SSO login URL, or null to open the in-page
// modal. A prompt that asks for a direct (non-SSO) sign-in keeps the modal: the
// SSO login only hands back another SSO session, which cannot satisfy it.
export function ssoLoginTarget(
  loginUrl: string | null | undefined,
  currentUrl: string,
  needsDirectSignIn: boolean,
): string | null {
  if (!loginUrl || needsDirectSignIn) return null
  return buildSsoLoginUrl(loginUrl, currentUrl)
}
