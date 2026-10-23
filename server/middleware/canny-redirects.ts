import { cannyRedirect } from '../utils/canny-redirect'

// 301 old Canny paths to their FeedLog equivalents. GET/HEAD only; /api is untouched.
export default defineEventHandler((event) => {
  if (event.method !== 'GET' && event.method !== 'HEAD') return
  const url = event.path
  const pathname = url.split('?')[0]!
  if (pathname === '/api' || pathname.startsWith('/api/')) return
  const changelogUrl = (useRuntimeConfig(event).public.changelogUrl as string) || undefined
  const target = cannyRedirect(pathname, changelogUrl)
  if (!target) return
  const search = url.includes('?') ? url.slice(url.indexOf('?')) : ''
  const location = target.startsWith('/') ? target + search : target
  return sendRedirect(event, location, 301)
})
