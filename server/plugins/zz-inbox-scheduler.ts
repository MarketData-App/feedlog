import type { InboxTaskContext, WakeMessage } from '../lib/inbox/scheduler'

// MarketData: load the inbox code on first use, not at startup. Its imports reach the Mastra
// agent runtime, whose module setup cost about 100 ms of the Worker's startup CPU; Cloudflare
// refuses a version whose startup exceeds its limit.
const platform = () => import('../lib/inbox/platform')
const scheduler = () => import('../lib/inbox/scheduler')

export default defineNitroPlugin(async nitroApp => {
  if (import.meta.preset?.startsWith('cloudflare')) {
    nitroApp.hooks.hook('cloudflare:queue', async ({ batch, env }) => {
      const { consumeBackground } = await platform()
      for (const message of batch.messages) {
        try {
          await consumeBackground({ cloudflare: { env: env as NonNullable<InboxTaskContext['cloudflare']>['env'] } }, message.body as WakeMessage)
          message.ack()
        } catch {
          console.warn('[inbox] Worker queue consumer failed')
          message.retry({ delaySeconds: 60 })
        }
      }
    })
  } else if (import.meta.preset !== 'vercel' && process.env.VERCEL !== '1') {
    let retry: ReturnType<typeof setTimeout> | undefined
    const restore = async () => {
      try {
        const { restoreNodeTimers } = await platform()
        await restoreNodeTimers()
        console.info('[inbox] Scheduler startup recovery completed')
      }
      catch (error) {
        const failure = await scheduler().then(m => m.schedulerFailure(error), () => error)
        console.warn('[inbox] Scheduler startup recovery unavailable; retrying', failure)
        retry = setTimeout(restore, 60000)
        retry.unref?.()
      }
    }
    // Plugins finish registering before localFetch enters the scheduler route.
    retry = setTimeout(restore, 0)
    nitroApp.hooks.hook('close', async () => { clearTimeout(retry); (await platform()).stopInboxTimers() })
  }
})
