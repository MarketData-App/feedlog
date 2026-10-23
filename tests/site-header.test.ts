import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defaultNavigation, type NavItem } from '@marketdataapp/ui/header'
import { absolutizeNavigation, siteHeaderHtml } from '../app/utils/site-header'
import { readThemeCookie, themeCookieDomain } from '../app/utils/theme-cookie'
import { extractSiteHeaderCss } from '../modules/site-header-css/extract'

const WWW = 'https://www.marketdata.app'

const nav: NavItem[] = [
  { type: 'link', label: 'Pricing', href: '/pricing/' },
  { type: 'link', label: 'Docs', href: 'https://docs.example/x' },
  { type: 'link', label: 'Here', href: '#x' },
  {
    type: 'dropdown',
    id: 'products',
    label: 'Products',
    columns: [{
      title: 'Explore',
      titleHref: '/data/',
      links: [
        { label: 'API', href: '/api/' },
        { label: 'Swagger', href: 'https://api.marketdata.app/', external: true },
        { label: 'Soon', href: '#', disabled: true },
      ],
    }],
    aside: { title: 'Updates', titleHref: '/news/', links: [{ label: 'Changelog', href: '/changelog/' }] },
  },
]

test('absolutizeNavigation puts relative hrefs on the website origin', () => {
  const out = absolutizeNavigation(nav, WWW)
  assert.deepEqual(out[0], { type: 'link', label: 'Pricing', href: 'https://www.marketdata.app/pricing/' })
})

test('absolutizeNavigation keeps absolute and # hrefs', () => {
  const out = absolutizeNavigation(nav, WWW)
  assert.equal((out[1] as { href: string }).href, 'https://docs.example/x')
  assert.equal((out[2] as { href: string }).href, '#x')
})

test('absolutizeNavigation recurses into dropdown columns, titles and the aside', () => {
  const dropdown = absolutizeNavigation(nav, `${WWW}/`)[3] as Extract<NavItem, { type: 'dropdown' }>
  assert.equal(dropdown.columns[0]!.titleHref, 'https://www.marketdata.app/data/')
  assert.deepEqual(dropdown.columns[0]!.links.map(l => l.href), [
    'https://www.marketdata.app/api/',
    'https://api.marketdata.app/',
    '#',
  ])
  assert.equal(dropdown.columns[0]!.links[1]!.external, true)
  assert.equal(dropdown.aside!.titleHref, 'https://www.marketdata.app/news/')
  assert.equal(dropdown.aside!.links[0]!.href, 'https://www.marketdata.app/changelog/')
})

test('absolutizeNavigation leaves the shared input untouched', () => {
  const before = JSON.stringify(defaultNavigation)
  absolutizeNavigation(defaultNavigation as NavItem[], WWW)
  assert.equal(JSON.stringify(defaultNavigation), before)
  absolutizeNavigation(nav, WWW)
  assert.equal(nav[0]!.type === 'link' && nav[0]!.href, '/pricing/')
})

const html = siteHeaderHtml({
  currentPath: '/p/some-post',
  websiteOrigin: WWW,
  loginUrl: 'https://dashboard-staging.marketdata.app/marketdata/login?amember_redirect_url=https%3A%2F%2Froadmap-staging.marketdata.app%2F',
  signupUrl: `${WWW}/signup/`,
})

test('siteHeaderHtml links the logo to the website', () => {
  assert.match(html, /<a href="https:\/\/www\.marketdata\.app\/" class="site-header-brand">/)
})

test('siteHeaderHtml carries the empty account-control slot', () => {
  assert.match(html, /<div id="user-profile" class="user-profile-container"><\/div>/)
})

test('siteHeaderHtml has no board-relative link', () => {
  assert.doesNotMatch(html, /href="\//)
  assert.match(html, /href="https:\/\/www\.marketdata\.app\/api\/"/)
  assert.match(html, /href="https:\/\/www\.marketdata\.app\/signup\/"/)
  assert.match(html, /href="https:\/\/dashboard-staging\.marketdata\.app\/marketdata\/login\?amember_redirect_url=/)
})

test('siteHeaderHtml uses the board-hosted logo files', () => {
  assert.match(html, /src="\/brand\/logo-on-light\.webp"/)
  assert.match(html, /src="\/brand\/logo-on-dark\.webp"/)
})

test('siteHeaderHtml names the logo "Market Data", not the kit default "MarketData"', () => {
  assert.equal([...html.matchAll(/alt="Market Data"/g)].length >= 2, true)
  assert.doesNotMatch(html, /alt="MarketData"/)
})

test('themeCookieDomain shares the kit cookie across marketdata.app only', () => {
  assert.equal(themeCookieDomain('roadmap-staging.marketdata.app'), '.marketdata.app')
  assert.equal(themeCookieDomain('roadmap.marketdata.app:443'), '.marketdata.app')
  assert.equal(themeCookieDomain('marketdata.app'), '.marketdata.app')
  assert.equal(themeCookieDomain('localhost:3000'), undefined)
  assert.equal(themeCookieDomain('evilmarketdata.app'), undefined)
})

test('readThemeCookie reads the kit choice and nothing else', () => {
  assert.equal(readThemeCookie('a=1; theme=dark; b=2'), 'dark')
  assert.equal(readThemeCookie('theme=light'), 'light')
  assert.equal(readThemeCookie('fl-theme=dark; theme=system'), null)
  assert.equal(readThemeCookie('xtheme=dark'), null)
  assert.equal(readThemeCookie('theme=darkest'), null)
  assert.equal(readThemeCookie(''), null)
})

const require = createRequire(import.meta.url)
const kitCss = readFileSync(require.resolve('@marketdataapp/ui/css/components.no-reset'), 'utf8')
const css = extractSiteHeaderCss(kitCss)

test('extractSiteHeaderCss keeps the header, account-control and toggle rules', () => {
  for (const selector of [
    '.site-header-bar {',
    '.site-header-panel[hidden]',
    '.site-header-drawer[data-open]',
    '.user-profile-container {',
    '.theme-toggle-wrapper .theme-toggle-button {',
  ]) assert.ok(css.includes(selector), `missing ${selector}`)
  assert.match(css, /@media \(width < 890px\) \{\s*\.site-header-row\[data-navbar-unmeasured\] \.site-header-links/)
  assert.match(css, /@property --tw-border-style/)
  assert.match(css, /@keyframes pulse/)
})

test('extractSiteHeaderCss drops every rule that could restyle the board', () => {
  for (const selector of ['.hidden {', '.flex {', '.text-sm {', 'label[disabled]', '.resena-widget', '.btn-orange-to-blue', '.copy-input-tooltip']) {
    assert.ok(!css.includes(selector), `kept ${selector}`)
  }
  assert.doesNotMatch(css, /:root/)
  assert.doesNotMatch(css, /@import/)
  assert.doesNotMatch(css, /@keyframes btn-shimmer-rotate/)
  assert.doesNotMatch(css, /^\s*\*,/m)
})

test('extractSiteHeaderCss scopes the kit tokens to the header', () => {
  assert.match(css, /^\.site-header, \.site-header-spacer \{\s*--font-sans:/m)
  assert.match(css, /^\.dark \.site-header, \.dark \.site-header-spacer \{\s*--color-/m)
  assert.match(css, /^:is\(\.dark, \[data-theme='dark'\]\) \.site-header, :is\(\.dark, \[data-theme='dark'\]\) \.site-header-spacer \{/m)
})

test('extractSiteHeaderCss gives the header the page context www gives it', () => {
  // www's body: the kit sans stack and --color-body; global.css overrides two kit
  // tokens the header reads, in each theme.
  assert.match(css, /^\.site-header \{\s*font-family: var\(--font-sans\);\s*color: var\(--color-body\);\s*--color-body-subtle: var\(--color-gray-600\);\s*--color-neutral-primary-strong: #F3F4F6;\s*\}/m)
  assert.match(css, /^:is\(\.dark, \[data-theme='dark'\]\) \.site-header \{\s*--color-body-subtle: var\(--color-gray-400\);\s*--color-neutral-primary-strong: var\(--color-gray-700\);\s*\}/m)
  // After the kit token blocks, so it wins at equal specificity.
  assert.ok(css.lastIndexOf('font-family: var(--font-sans)') > css.indexOf(':is(.dark, [data-theme=\'dark\']) .site-header, '))
})

test('board home: only the board bar offers "New request"; the toolbar copy stays hidden', () => {
  // The toolbar button made the row 410 px wide at a 390 px phone width (sideways
  // scroll) and doubled the board bar's button on desktop. It stays in the DOM,
  // hidden, so FeedLog's mobile-search transition keeps its anchor.
  const toolbar = readFileSync(new URL('../app/components/board/BoardSearchToolbar.vue', import.meta.url), 'utf8')
  const button = toolbar.match(/<Button\b[^>]*data-fdl-source="toolbar"[^>]*>/s)?.[0] ?? ''
  assert.ok(button, 'toolbar New Request button found')
  assert.match(button, /\bclass="[^"]*\bhidden\b[^"]*"/)
  assert.match(button, /v-show="!searchOpenMobile"/)
  const bar = readFileSync(new URL('../app/components/BoardBar.vue', import.meta.url), 'utf8')
  assert.match(bar, /data-fdl-source="board-bar"/)
})
