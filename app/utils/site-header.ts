import { defaultNavigation, renderHeader } from '@marketdataapp/ui/header'
import type { NavItem, NavLink, NavSection } from '@marketdataapp/ui/header'

// MarketData: the public pages wear the marketdata.app site header from the
// shared kit (@marketdataapp/ui), so the board reads as a part of the website.
// The header is rendered here to a string on the server (and identically on the
// client during hydration); app/layouts/default.vue emits it and calls the
// kit's initHeader() once mounted. See the kit README, "Site Header".

// A scheme ("https:", "mailto:"), a protocol-relative "//host" or an in-page "#"
// is already absolute for our purposes. Everything else is a website path.
const ABSOLUTE_HREF = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i

function absolutize(href: string, origin: string): string {
  return ABSOLUTE_HREF.test(href) ? href : new URL(href, `${origin}/`).href
}

function absolutizeSection(section: NavSection, origin: string): NavSection {
  return {
    ...section,
    ...(section.titleHref === undefined ? {} : { titleHref: absolutize(section.titleHref, origin) }),
    links: section.links.map((link: NavLink) => ({ ...link, href: absolutize(link.href, origin) })),
  }
}

// The kit's navigation links website pages by path ("/api/"). On the board's own
// host those paths would point at the board, so each one moves to the website
// origin. Returns new objects: `defaultNavigation` is module state shared by
// every request a Worker serves and must never be written to.
export function absolutizeNavigation(nav: readonly NavItem[], origin: string): NavItem[] {
  const base = origin.replace(/\/+$/, '')
  return nav.map((item): NavItem => {
    if (item.type === 'link') return { ...item, href: absolutize(item.href, base) }
    return {
      ...item,
      columns: item.columns.map(section => absolutizeSection(section, base)),
      ...(item.aside ? { aside: absolutizeSection(item.aside, base) } : {}),
    }
  })
}

// The board owns the account control (Task 3 fills it): the slot keeps the id
// the kit's overflow pass and initHeader look for, and initHeader is called with
// `userProfile: false` so it never renders into it or clears it.
export const ACCOUNT_SLOT = '<div id="user-profile" class="user-profile-container"></div>'

export interface SiteHeaderOptions {
  currentPath: string
  websiteOrigin: string
  /** The drawer's fallback "Log In" link. Absolute. */
  loginUrl: string
  /** The drawer's fallback "Try For Free" link. Absolute. */
  signupUrl: string
}

export function siteHeaderHtml(opts: SiteHeaderOptions): string {
  const origin = opts.websiteOrigin.replace(/\/+$/, '')
  return renderHeader({
    currentPath: opts.currentPath,
    navigation: absolutizeNavigation(defaultNavigation, origin),
    homeHref: `${origin}/`,
    loginUrl: opts.loginUrl,
    signupUrl: opts.signupUrl,
    // The kit's 320px webp files, copied to public/brand/ (2x for the 160px slot).
    // alt: the kit's default is "MarketData"; the company name is two words.
    logo: { light: '/brand/logo-on-light.webp', dark: '/brand/logo-on-dark.webp', alt: 'Market Data' },
    slots: { auth: ACCOUNT_SLOT },
  })
}
