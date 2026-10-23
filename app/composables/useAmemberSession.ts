import { initUserProfile } from '@marketdataapp/ui/user-profile'
import type { AuthSession } from '~/composables/useAuth'
import { buildSsoLoginUrl } from '~/utils/sso-login-url'
import {
  HANDOFF_TIMEOUT_MS,
  boardSessionFor,
  buildLoginHref,
  classifyUserResponse,
  decideHandoff,
  isEndpointLink,
  isHandoffExcludedPath,
  markRedirected,
  readRedirected,
  silentHandoffUrl,
  waitForSilentMessage,
  type DashboardUser,
} from '~/utils/sso-handoff'

// MarketData: the board follows the marketdata.app dashboard login (spec §11).
// The rules live in ~/utils/sso-handoff (tested); this wires them to the page:
// - the kit's account control in the header's #user-profile slot;
// - the "Log in" links, which return to the page the visitor is on;
// - "Log out", which also ends the board's SSO session;
// - the background handoff (hidden iframe, one top-level fallback per browser
//   session) and the logout sync.
// Client only. The default layout calls it; it needs the auth-session payload
// that the layout has awaited.

const SIGN_OUT_TIMEOUT_MS = 5000

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage
  }
  catch {
    return null
  }
}

export function useAmemberSession() {
  const config = useRuntimeConfig().public
  const { data: session } = useNuxtData<AuthSession | null>('auth-session')
  const route = useRoute()
  const { locales } = useI18n()
  const { signOut } = useAuth()

  const apiUrl = String(config.amemberApiUrl)
  const loginUrl = String(config.amemberLoginUrl)
  const logoutUrl = String(config.amemberLogoutUrl)
  const ssoLoginUrl = String(config.ssoLoginUrl || '')
  const websiteUrl = String(config.websiteUrl || 'https://www.marketdata.app').replace(/\/+$/, '')
  const dashboardOrigin = new URL(loginUrl).origin

  const boardSession = computed(() => boardSessionFor(session.value as Parameters<typeof boardSessionFor>[0]))
  // The board admin's own sign-in (/team-login): the header shows the board
  // identity, and the dashboard login never touches it.
  const isLocalSession = computed(() => !!boardSession.value && !boardSession.value.ssoOrgId)
  const isSsoSession = computed(() => !!boardSession.value?.ssoOrgId)

  // The kit control, set up as www sets it up (dropdown, "Try For Free" on the
  // website), pointed at this environment's dashboard.
  function mountControl(container: HTMLElement): () => void {
    let cleanup: (() => void) | undefined
    let disposed = false
    initUserProfile({
      container,
      dropdown: true,
      apiUrl,
      loginUrl: buildLoginHref(loginUrl, window.location.href),
      logoutUrl,
      signupUrl: `${websiteUrl}/signup/`,
      signupText: 'Try For Free',
      dashboardUrl: `${dashboardOrigin}/marketdata/member`,
      profileUrl: `${dashboardOrigin}/marketdata/profile`,
      planUrl: String(config.amemberSignupUrl),
    }).then((done) => {
      if (disposed) done()
      else cleanup = done
    }).catch(() => { /* the slot stays empty; the drawer keeps Log In */ })
    return () => {
      disposed = true
      cleanup?.()
    }
  }

  async function signOutBoard(): Promise<boolean> {
    try {
      const result = await Promise.race([
        signOut(),
        new Promise<{ error: string }>(resolve => setTimeout(() => resolve({ error: 'timeout' }), SIGN_OUT_TIMEOUT_MS)),
      ])
      return !(result as { error?: unknown } | null)?.error
    }
    catch {
      return false
    }
  }

  // One delegated listener set on the header (capture): it covers the control's
  // links and the drawer's fallback "Log In". A login link gets the current page
  // as its return address just before it is used (pointer, keyboard focus, or
  // click), as the page may have changed since it was rendered.
  function onHeaderEvent(event: Event) {
    const link = (event.target as Element | null)?.closest?.('a')
    if (!link?.href) return
    if (isEndpointLink(link.href, loginUrl)) {
      link.href = buildLoginHref(link.href, window.location.href)
      return
    }
    // "Log out" ends the board's SSO session too, then goes on to the
    // dashboard logout. A modified click (new tab) is left alone; the logout
    // sync on the next board page covers it.
    if (event.type !== 'click' || !isEndpointLink(link.href, logoutUrl) || !isSsoSession.value) return
    const click = event as MouseEvent
    if (click.defaultPrevented || click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return
    event.preventDefault()
    const target = link.href
    signOutBoard().finally(() => window.location.assign(target))
  }

  async function fetchDashboardUser(): Promise<DashboardUser> {
    try {
      const res = await fetch(apiUrl, { credentials: 'include' })
      const body = res.status === 200 ? await res.json().catch(() => null) : null
      return classifyUserResponse(res.status, body)
    }
    catch {
      return { kind: 'unknown' }
    }
  }

  // The aMember plugin in a hidden frame. It never shows anything: a login
  // form inside it (dashboard session gone) just runs into the timeout. The
  // sandbox keeps whatever loads there from navigating this page or posting a
  // form; scripts and same-origin are what /sso/silent needs to answer.
  async function silentHandoff(): Promise<boolean> {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('tabindex', '-1')
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin')
    frame.setAttribute('data-sso-handoff', '')
    frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden'
    frame.src = silentHandoffUrl(ssoLoginUrl, window.location.origin)
    document.body.appendChild(frame)
    const answered = await waitForSilentMessage({
      target: window,
      ownOrigin: window.location.origin,
      source: frame.contentWindow,
      timeoutMs: HANDOFF_TIMEOUT_MS,
    })
    frame.remove()
    if (!answered) return false
    // The handoff set the board cookie. Refresh the session in place; on a new
    // account the auth-reload plugin reloads this same page once, so per-user
    // state (vote highlights, subscriptions) is drawn for the new user.
    await refreshNuxtData('auth-session')
    return !!boardSessionFor(session.value as Parameters<typeof boardSessionFor>[0])
  }

  // The dashboard reports nobody, and the board still holds an SSO session.
  async function syncLogout() {
    const ok = await signOutBoard()
    await refreshNuxtData('auth-session')
    // Reload once, so nothing drawn for the old account stays on the page.
    // Only after a sign-out that worked: the next load then finds no board
    // session, so it cannot come back here. reloadNuxtApp's own 10 s marker is
    // a second guard.
    if (ok && !session.value?.user) reloadNuxtApp()
  }

  let started = false
  async function runHandoff(): Promise<void> {
    if (started || !ssoLoginUrl) return
    started = true
    const localeCodes = locales.value.map(l => (typeof l === 'string' ? l : l.code))
    if (isHandoffExcludedPath(route.path, localeCodes)) return
    // Nothing the dashboard says changes a team-login session: do not ask.
    if (isLocalSession.value) return

    const dashboard = await fetchDashboardUser()
    // No clear answer (network, CORS): leave everything as it is.
    if (dashboard.kind === 'unknown') return
    const amemberUser = dashboard.kind === 'user' ? dashboard.user : null
    const storage = sessionStore()

    const first = decideHandoff({
      amemberUser,
      boardSession: boardSession.value,
      redirectedThisSession: readRedirected(storage),
      iframeFailed: false,
    })
    if (first === 'signout') return syncLogout()
    if (first !== 'iframe') return
    if (await silentHandoff()) return

    const next = decideHandoff({
      amemberUser,
      boardSession: boardSession.value,
      redirectedThisSession: readRedirected(storage),
      iframeFailed: true,
    })
    // Mark first; a page that cannot keep the mark never redirects.
    if (next === 'redirect' && markRedirected(storage)) {
      window.location.assign(buildSsoLoginUrl(ssoLoginUrl, window.location.href))
    }
  }

  return { isLocalSession, mountControl, onHeaderEvent, runHandoff }
}
