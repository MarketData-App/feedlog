// Old Canny URLs -> FeedLog. Returns the 301 target, or null for no redirect.
//   /features              -> /
//   /features/p/<slug>     -> /p/<slug>
//   /changelog[/...]       -> changelogUrl (only when configured)
export function cannyRedirect(path: string, changelogUrl: string | undefined): string | null {
  const clean = path.split('?')[0]!.split('#')[0]!.replace(/\/+$/, '')
  if (clean === '/features') return '/'
  const post = /^\/features\/p\/([^/]+)$/.exec(clean)
  if (post) return `/p/${post[1]}`
  if (changelogUrl && (clean === '/changelog' || clean.startsWith('/changelog/'))) return changelogUrl
  return null
}
