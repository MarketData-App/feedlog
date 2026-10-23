// Recipient allowlist for non-production environments (EMAIL_ALLOWED_DOMAINS).
// Empty or undefined list means no filtering. Matching is exact on the domain
// (the part after the last "@"), case-insensitive, with no subdomain wildcard.

export function filterAllowedRecipients(
  to: string | string[],
  allowed: string | undefined,
): { send: string[]; dropped: string[] } {
  const recipients = Array.isArray(to) ? to : [to]
  const domains = (allowed ?? '')
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean)
  if (domains.length === 0) return { send: [...recipients], dropped: [] }

  const send: string[] = []
  const dropped: string[] = []
  for (const address of recipients) {
    const at = address.lastIndexOf('@')
    const domain = at >= 0 ? address.slice(at + 1).trim().toLowerCase() : ''
    ;(domain && domains.includes(domain) ? send : dropped).push(address)
  }
  return { send, dropped }
}

export function recipientDomain(address: string): string {
  const at = address.lastIndexOf('@')
  return at >= 0 ? address.slice(at + 1).toLowerCase() : 'invalid'
}
