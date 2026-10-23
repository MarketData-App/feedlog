// Staging: keep search engines out. NOINDEX=true adds X-Robots-Tag to every
// response and serves a disallow-all robots.txt.
export default defineEventHandler((event) => {
  if (process.env.NOINDEX !== 'true') return
  setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
  if (event.path.split('?')[0] === '/robots.txt') {
    setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
    return 'User-agent: *\nDisallow: /\n'
  }
})
