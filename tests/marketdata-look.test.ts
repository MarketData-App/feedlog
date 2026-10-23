import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

// MarketData: the board's look and identity, matched to www.marketdata.app.
// nuxt.config.ts needs the Nuxt runtime to import, so these checks read it as text.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url))
const text = (path: string) => read(path).toString('utf8')
const config = text('nuxt.config.ts')
const css = text('app/assets/css/marketdata.css')

test('English only: one locale and no browser-language redirect', () => {
  const i18n = config.slice(config.indexOf('i18n: {'), config.indexOf('hub: {'))
  assert.match(i18n, /detectBrowserLanguage: false/)
  assert.deepEqual([...i18n.matchAll(/code: '([a-z-]+)'/g)].map(m => m[1]), ['en'])
})

test('the head icons are the official Market Data files, and each one exists', () => {
  const hrefs = [...config.matchAll(/key: 'favicon-[a-z]+', rel: '[a-z -]+', href: '([^']+)'/g)].map(m => m[1]!)
  assert.deepEqual(hrefs, ['/favicon.svg', '/favicon-96x96.png', '/favicon.ico', '/apple-touch-icon.png'])
  for (const href of hrefs) assert.ok(existsSync(new URL(`../public${href}`, import.meta.url)), href)
  // AppLogo shows /logo.svg in the post and login windows: the same Market Data icon.
  assert.deepEqual(read('public/logo.svg'), read('public/favicon.svg'))
  assert.match(text('app/components/AppLogo.vue'), /alt="Market Data"/)
})

// sha256 of upstream FeedLog's public/og.png: an upstream merge must not bring it back.
const FEEDLOG_OG_SHA256 = '5d537feeffb2f0f910c7c44ee511b8524f920a8c83dceecac149d1065c352292'

test('the share card is the Market Data card, 1200 x 630 PNG', () => {
  const png = read('public/og.png')
  assert.notEqual(createHash('sha256').update(png).digest('hex'), FEEDLOG_OG_SHA256)
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG')
  assert.equal(png.readUInt32BE(16), 1200)
  assert.equal(png.readUInt32BE(20), 630)
})

test('the site name is "Market Data"', () => {
  assert.match(config, /site: \{[^}]*name: 'Market Data'/)
})

test('marketdata.css is registered and holds the palette and the hide rules', () => {
  assert.match(config, /css: \[resolver\.resolve\('\.\/app\/assets\/css\/marketdata\.css'\)\]/)
  // (0,4,0) beats the runtime theme's `:root:root` / `:root.dark` (0,2,0).
  assert.match(css, /:root:root:root:not\(\.dark\) \{[^}]*--background:/)
  assert.match(css, /:root:root:root\.dark \{[^}]*--background:/)
  assert.match(css, /a\[href="https:\/\/feedlog\.ai"\] \{\s*display: none;/)
  assert.match(css, /button:has\(> \.i-lucide\\:globe\) \{\s*display: none;/)
  assert.match(css, /font-family:\s*system-ui,/)
})

test('board copy writes "Market Data", not "MarketData"', () => {
  const values: string[] = []
  const walk = (node: unknown) => {
    if (typeof node === 'string') values.push(node)
    else if (node && typeof node === 'object') Object.values(node).forEach(walk)
  }
  walk(JSON.parse(text('i18n/locales/en.json')))
  assert.deepEqual(values.filter(v => v.includes('MarketData')), [])
  assert.doesNotMatch(text('server/utils/signup-allowlist.ts'), /message: '[^']*MarketData/)
  assert.match(text('wrangler.toml'), /EMAIL_FROM = "Market Data Roadmap </)
})
