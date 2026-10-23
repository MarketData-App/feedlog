// MarketData: the marketdata.app kit's theme toggle (@marketdataapp/ui
// theme-toggle) stores the choice in a `theme` cookie — `dark` | `light`, absent
// = follow the OS — on .marketdata.app, so the website, the dashboard and the
// board share one choice. FeedLog reads and writes the same cookie
// (useThemeMode). Off marketdata.app (local development) it is host-only.
// Kept apart from site-header.ts so the theme code in the entry chunk does not
// pull in the header renderer.

export const THEME_COOKIE = 'theme'

export type KitThemeChoice = 'dark' | 'light'

export function themeCookieDomain(host: string): string | undefined {
  const bare = host.toLowerCase().replace(/:\d+$/, '')
  return bare === 'marketdata.app' || bare.endsWith('.marketdata.app') ? '.marketdata.app' : undefined
}

// The cookie's value as a stored choice; anything else is no choice.
export function kitThemeChoice(value: unknown): KitThemeChoice | null {
  return value === 'dark' || value === 'light' ? value : null
}

// The choice in a Cookie header / document.cookie string (the kit's own rule).
export function readThemeCookie(cookies: string): KitThemeChoice | null {
  return kitThemeChoice(cookies.match(/(?:^|;\s*)theme=(dark|light)(?:;|$)/)?.[1])
}

// Apply a resolved theme to <html> the way the kit does: `dark` / `light` class
// and `data-theme`, always set together. The kit header's CSS reads either the
// class or the attribute, FeedLog's reads the class; a stale `data-theme="dark"`
// left by the kit toggle would keep the header dark on a light board.
export function applyDocumentTheme(el: HTMLElement, dark: boolean) {
  el.classList.toggle('dark', dark)
  el.classList.toggle('light', !dark)
  el.setAttribute('data-theme', dark ? 'dark' : 'light')
}

// The same for the inline no-flash script, which runs before any bundle.
export const DOCUMENT_THEME_SNIPPET = 'function(d){var h=document.documentElement;h.classList.toggle("dark",d);h.classList.toggle("light",!d);h.setAttribute("data-theme",d?"dark":"light")}'
