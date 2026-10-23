import { initUserProfile } from '@marketdataapp/ui/user-profile'
import type { AuthSession } from '~/composables/useAuth'
import {
  DASHBOARD_TIMEOUT_MS,
  HANDOFF_TIMEOUT_MS,
  boardSessionFor,
  buildLoginHref,
  editableText,
  fetchDashboardUserWith,
  headerLinkAction,
  holdsTypedText,
  mayNavigateAway,
  runHandoffFlow,
  silentHandoffUrl,
  waitForSilentMessage,
  type DashboardUser,
  type FieldView,
} from '~/utils/sso-handoff'

// MarketData: the board follows the marketdata.app dashboard login (spec §11).
// The rules live in ~/utils/sso-handoff (tested); this wires them to the page:
// - the kit's account control in the header's #user-profile slot;
// - the "Log in" links, which return to the page the visitor is on;
// - "Log out", which also ends the board's SSO session;
// - the background handoff (hidden iframe, one top-level fallback per tab),
//   the account switch, and the logout sync (runHandoffFlow). The flow never
//   redirects or reloads while the visitor types or on a page open longer than
//   15 s (mayNavigate), and it stops when the layout unmounts (cancelHandoff).
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
  // links and the drawer's fallback "Log In". What each event asks for is
  // decided by headerLinkAction (tested): a login link gets the current page as
  // its return address just before use; "Log out" ends the board's SSO session
  // first, then goes on to the dashboard logout.
  function onHeaderEvent(event: Event) {
    const link = (event.target as Element | null)?.closest?.('a')
    const mouse = event as MouseEvent
    const action = headerLinkAction({
      eventType: event.type,
      href: link?.href,
      loginUrl,
      logoutUrl,
      currentUrl: window.location.href,
      isSsoSession: isSsoSession.value,
      button: typeof mouse.button === 'number' ? mouse.button : 0,
      modified: !!(mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey),
      defaultPrevented: event.defaultPrevented,
    })
    if (!link || action.kind === 'ignore') return
    if (action.kind === 'login') {
      link.href = action.href
      return
    }
    event.preventDefault()
    const target = link.href
    signOutBoard().finally(() => window.location.assign(target))
  }

  // Aborted when the layout unmounts (cancelHandoff): the dashboard question,
  // the frame wait and every later step of the flow stop.
  let controller: AbortController | null = null

  // At most 5 s; no answer in time is "unknown", which changes nothing.
  function fetchDashboardUser(): Promise<DashboardUser> {
    return fetchDashboardUserWith({
      fetch: (url, init) => window.fetch(url, init),
      apiUrl,
      timeoutMs: DASHBOARD_TIMEOUT_MS,
      signal: controller?.signal,
    })
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
      signal: controller?.signal,
    })
    frame.remove()
    return answered
  }

  // The handoff set the board cookie: read the new session into the page, no
  // reload. Reactive readers of the session (header, board bar, comment box)
  // follow by themselves; the auth-reload plugin sees the new user and moves
  // the session epoch, so the surfaces with per-viewer state (votes, likes,
  // subscription) fetch those fields again. A guest's writes are claimed by
  // the default layout when hasAccount turns true.
  async function refreshInPlace() {
    await refreshNuxtData('auth-session')
  }

  // After a sign-out (the logout sync, or a switch that could not finish):
  // reload once, so nothing drawn for the old account stays on the page. Only
  // when no session is left: the next load then has nothing to sign out, so it
  // cannot come back here. reloadNuxtApp's own 10 s marker is a second guard.
  async function afterSignOut() {
    await refreshNuxtData('auth-session')
    if (!session.value?.user) reloadNuxtApp()
  }

  // The navigation guard, read from the page just before a redirect or a
  // reload: the focused element, typed text in any field (the comment editor,
  // the new-request form, the search box), and how long the page is open.
  function pageFields(): FieldView[] {
    return Array.from(document.querySelectorAll<HTMLElement>('input, textarea, [contenteditable]'), (el) => {
      const field = el as HTMLElement & { type?: string, value?: string, defaultValue?: string }
      return {
        tagName: el.tagName,
        type: field.type ?? null,
        isContentEditable: el.isContentEditable,
        value: typeof field.value === 'string' ? field.value : null,
        defaultValue: typeof field.defaultValue === 'string' ? field.defaultValue : null,
        text: el.isContentEditable ? editableText(el) : null,
      }
    })
  }
  function mayNavigate(): boolean {
    return mayNavigateAway({
      focused: document.activeElement as HTMLElement | null,
      unsavedText: holdsTypedText(pageFields()),
      pageAgeMs: performance.now(),
    })
  }

  let started = false
  async function runHandoff(): Promise<void> {
    if (started) return
    started = true
    controller = new AbortController()
    await runHandoffFlow({
      ssoLoginUrl,
      path: route.path,
      localeCodes: locales.value.map(l => (typeof l === 'string' ? l : l.code)),
      storage: sessionStore(),
      boardSession: () => boardSession.value,
      fetchDashboardUser,
      signOutBoard,
      silentHandoff,
      refreshInPlace,
      afterSignOut,
      redirect: url => window.location.assign(url),
      currentUrl: () => window.location.href,
      mayNavigate,
      signal: controller.signal,
    })
  }

  // The layout unmounts: no redirect, reload or sign-out after this.
  function cancelHandoff() {
    controller?.abort()
  }

  return { isLocalSession, mountControl, onHeaderEvent, runHandoff, cancelHandoff }
}
