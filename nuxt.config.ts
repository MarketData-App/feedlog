// https://nuxt.com/docs/api/configuration/nuxt-config
import { createResolver } from '@nuxt/kit'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { HELP_COLLECTION_ICONS } from './shared/constants/help'

const resolver = createResolver(import.meta.url)
const require = createRequire(import.meta.url)
const mastraPackage = require.resolve('@mastra/core/package.json')
const mastraRequire = createRequire(mastraPackage)
const mastraDependencies = JSON.parse(readFileSync(mastraPackage, 'utf8')).dependencies as Record<string, string>
const mastraTraceInclude: string[] = []
const mastraTraceAlias: Record<string, string> = {}

// Nitro traces canonical package names; Mastra imports versioned npm aliases.
for (const [alias, specifier] of Object.entries(mastraDependencies)) {
  if (!specifier.startsWith('npm:')) continue
  const entry = mastraRequire.resolve(alias)
  const packageRoot = resolve(dirname(entry), '..')
  const pkg = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
    name: string, version: string, exports?: Record<string, { import?: string }>
  }
  mastraTraceInclude.push(entry)
  const esmEntry = pkg.exports?.['.']?.import
  if (esmEntry) mastraTraceInclude.push(resolve(packageRoot, esmEntry))
  mastraTraceAlias[pkg.name] = alias
  mastraTraceAlias[`.nitro/${pkg.name}@${pkg.version}`] = alias
}

export default defineNuxtConfig({
  // `$meta.name` makes Nuxt auto-generate a `#layers/feedlog` alias pointing
  // at this layer's rootDir, whether this project runs standalone (`cd` in,
  // `pnpm dev`) or is embedded as a consumer's layer (e.g. under
  // `<your-app>/layers/feedlog/`). Official:
  // https://nuxt.com/docs/4.x/guide/going-further/layers
  //
  // Required for the standalone case — in the consumer case Nuxt's
  // auto-scan of `~~/layers/<dirname>/` would also generate the same alias
  // from the directory name, but we keep `$meta.name` explicit so standalone
  // runs don't break and the layer's identity isn't tied to a particular
  // directory name.
  $meta: { name: 'feedlog' },

  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // NOTE: `#shared` is owned by the active Nuxt instance (the consumer), so
  // a downstream app extending this layer can place its own `shared/types/*`
  // and import via `#shared/`. This layer's own layer-local references go
  // through `#layers/feedlog/...` (auto-generated from $meta.name above).

  // app/stores/ is NOT in Nuxt's layer auto-merge list, so when feedlog is
  // consumed as a layer, `useBoardStore` etc. would not auto-import. Force
  // registration with an absolute path so Pinia stores work in both standalone
  // and extended contexts.
  imports: {
    dirs: [resolver.resolve('./app/stores')],
  },

  app: {
    head: {
      // Keyed so a configured org logo can override every icon slot at runtime
      // (app.vue). type/sizes are intentionally omitted: unhead merges keyed
      // tags by union, so any hint here would leak onto the override and
      // mislabel a logo of a different format. The browser sniffs the served
      // content-type either way.
      link: [
        { key: 'favicon-svg', rel: 'icon', href: '/logo.svg' },
        { key: 'favicon-png', rel: 'icon', href: '/favicon.png' },
        { key: 'favicon-ico', rel: 'shortcut icon', href: '/favicon.ico' },
        { key: 'favicon-apple', rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },

  site: {
    name: 'FeedLog',
  },

  components: [
    { path: resolver.resolve('./app/components'), pathPrefix: false },
  ],

  modules: [
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxt/icon',
    '@nuxt/image',
    '@nuxtjs/i18n',
    '@nuxtjs/seo',
    '@pinia/nuxt',
    '@nuxtjs/tailwindcss',
    'shadcn-nuxt',
    '@nuxthub/core',
    // CF-only bootstrap module: adds a /setup page + /api/_migrate endpoints
    // so the one-click Cloudflare Deploy Button can finish DB migrations on
    // first request. All handlers no-op (404) under non-CF presets.
    // Resolver path keeps layer-consumer usage working.
    resolver.resolve('./modules/cf-setup/module'),
    // Node / Docker only: registers an S3-compatible blob provider at
    // runtime when S3_* env vars are set. Skipped on cloudflare-module
    // and vercel presets where NuxtHub's R2 / Vercel Blob driver applies.
    resolver.resolve('./modules/blob-s3/module'),
    resolver.resolve('./modules/widget-preload/module'),
    // MarketData: the kit site header's CSS, cut from @marketdataapp/ui.
    resolver.resolve('./modules/site-header-css/module'),
  ],
  shadcn: {
    prefix: '',
    componentDir: resolver.resolve('./app/components/ui'),
  },
  fonts: {
    families: [
      {
        name: 'Inter',
        provider: 'google',
        weights: [400, 500, 600, 700],
      },
    ],
  },
  i18n: {
    strategy: 'prefix_except_default',
    defaultLocale: 'en',
    vueI18n: 'i18n.config.ts',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'feedlog_locale',
      redirectOn: 'root',
    },
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'zh', language: 'zh-CN', name: '中文', file: 'zh.json' },
    ],
  },
  hub: {
    blob: true,
  },

  // The widget frame's identity rides in the URL fragment, which never reaches
  // the server, so a server render can only produce an empty shell — one the
  // visitor never sees, because the SDK keeps the frame hidden until it reports
  // ready. Rendering it costs ~290ms of TTFB and a hydration pass on top.
  //
  // That shell is the same bytes for everyone opening the frame on a host, so
  // it is worth caching — but briefly: a deploy rotates the asset hashes the
  // shell points at, and a stale one asks for chunks the new image never built.
  routeRules: {
    // Functional pages are excluded from discovery and carry a noindex response.
    // Nuxt SEO applies these rules to configured locale prefixes as well.
    '/dashboard/**': { sitemap: false, robots: false },
    '/auth/**': { sitemap: false, robots: false },
    '/invite': { sitemap: false, robots: false },
    '/reset-password': { sitemap: false, robots: false },
    '/team-login': { sitemap: false, robots: false },
    '/verified': { sitemap: false, robots: false },
    '/mcp/**': { sitemap: false, robots: false },
    '/sso/**': { sitemap: false, robots: false },
    '/setup': { sitemap: false, robots: false },
    '/widget/**': { sitemap: false, robots: false },
    '/widget/embed': {
      ssr: false,
      headers: { 'cache-control': 'public, max-age=300, stale-while-revalidate=600' },
    },
    '/*/widget/embed': {
      ssr: false,
      headers: { 'cache-control': 'public, max-age=300, stale-while-revalidate=600' },
    },
  },

  icon: {
    clientBundle: {
      scan: {
        // Resolve layer paths here; relative globs scan the extending app.
        // Include TypeScript for navigation and status icon maps.
        globInclude: [
          'app/**/*.{vue,ts,js,tsx,jsx}',
          'shared/**/*.{ts,js}',
          'modules/**/*.{vue,ts,js,tsx,jsx}',
          resolver.resolve('./app/**/*.{vue,ts,js,tsx,jsx}'),
          resolver.resolve('./shared/**/*.{ts,js}'),
          resolver.resolve('./modules/**/*.{vue,ts,js,tsx,jsx}'),
        ],
      },
      // Collection icons come from stored values and are assembled at runtime.
      icons: HELP_COLLECTION_ICONS.map(icon => `lucide:${icon}`),
    },
  },

  build: {
    transpile: ['reka-ui'],
  },

  vite: {
    // MarketData: the kit's client modules, prebundled up front in dev.
    optimizeDeps: {
      include: ['@marketdataapp/ui/header-client'],
    },
    ssr: {
      // PostCSS uses nanoid's CommonJS entry through sanitize-html. Bundle it
      // before Nitro can resolve the flattened import to the ESM-only version.
      noExternal: ['nanoid'],
    },
  },

  nitro: {
    externals: {
      traceInclude: mastraTraceInclude,
      traceAlias: mastraTraceAlias,
    },
    // Mastra's hashing dependency ships a native Wasm module for Workers.
    experimental: { wasm: true, tasks: true },
    tasks: {
      'inbox:schedule': { handler: resolver.resolve('./server/tasks/inbox/schedule.ts') },
    },
    scheduledTasks: {
      [!process.env.NITRO_PRESET?.startsWith('cloudflare') && !process.env.NITRO_PRESET?.startsWith('vercel') && process.env.VERCEL !== '1'
        ? '*/5 * * * *' : '0 3 * * *']: ['inbox:schedule'],
    },
    vercel: { functions: { experimentalTriggers: [{ type: 'queue/v2beta', topic: 'feedlog-inbox', retryAfterSeconds: 60 }] } },
    // Workers use pg's JavaScript client; its optional native addon is Node-only.
    alias: process.env.NITRO_PRESET?.startsWith('cloudflare')
      ? {
          'pg-native': resolver.resolve('./server/lib/agent/pg-native-unavailable.cjs'),
          '@vercel/queue': resolver.resolve('./server/lib/inbox/vercel-queue-unavailable.ts'),
          // unenv's ESM `debug` stub is not callable via require(); see the shim.
          'debug': resolver.resolve('./server/lib/agent/debug-noop.cjs'),
        }
      : {},
    // Keep CF Workers' native node:fs / path / process available at runtime so
    // the cf-setup module can read bundled migration files via `/bundle/...`.
    // Without this, Nitro's unenv stub shadows them, reads return empty, and
    // the state classifier never leaves `bootstrap`.
    unenv: {
      external: ['node:fs', 'node:fs/promises', 'node:path', 'node:process'],
    },
  },

  ogImage: {
    enabled: false,
  },

  runtimeConfig: {
    public: {
      uploadPrefix: process.env.NUXT_PUBLIC_UPLOAD_PREFIX || 'uploads',
      // Product-SSO login page (MarketData: the aMember feedlog-sso plugin).
      // When set, every "Sign in" goes there with return_to=<current URL>.
      // Read at runtime from NUXT_PUBLIC_SSO_LOGIN_URL (a Worker var on
      // Cloudflare); the key must exist here for that override to apply.
      ssoLoginUrl: process.env.NUXT_PUBLIC_SSO_LOGIN_URL || '',
      // External changelog (MarketData: the website). When set, the nav links
      // there and /changelog redirects there. Runtime: NUXT_PUBLIC_CHANGELOG_URL.
      changelogUrl: process.env.NUXT_PUBLIC_CHANGELOG_URL || '',
      // MarketData site header and account control (public pages). The website
      // origin: header navigation, logo link, sign-up. The aMember dashboard:
      // who is logged in (/api/user/), log in, log out, sign up. Defaults are
      // production; staging sets NUXT_PUBLIC_* Worker vars (wrangler.toml).
      websiteUrl: process.env.NUXT_PUBLIC_WEBSITE_URL || 'https://www.marketdata.app',
      amemberApiUrl: process.env.NUXT_PUBLIC_AMEMBER_API_URL || 'https://dashboard.marketdata.app/api/user/',
      amemberLoginUrl: process.env.NUXT_PUBLIC_AMEMBER_LOGIN_URL || 'https://dashboard.marketdata.app/marketdata/login',
      amemberLogoutUrl: process.env.NUXT_PUBLIC_AMEMBER_LOGOUT_URL || 'https://dashboard.marketdata.app/marketdata/logout',
      amemberSignupUrl: process.env.NUXT_PUBLIC_AMEMBER_SIGNUP_URL || 'https://dashboard.marketdata.app/marketdata/signup',
    },
  },
})
