// MarketData: who sees the board's admin entries — the board bar's Admin link
// and, in the header, the admin control's "Board admin" label and Admin link:
// the org's owners and managers (useOrgContext().role).
export function isBoardAdminRole(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'manager'
}
