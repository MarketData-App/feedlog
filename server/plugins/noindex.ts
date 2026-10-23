// Staging: the @nuxtjs/robots middleware sets its own X-Robots-Tag on page
// routes after server/middleware/noindex.ts has run. Set the header again just
// before the response goes out, so NOINDEX=true always wins.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', (event) => {
    if (process.env.NOINDEX === 'true') {
      setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
    }
  })
})
