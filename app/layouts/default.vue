<script setup lang="ts">
import { initHeader } from '@marketdataapp/ui/header-client'
import { siteHeaderHtml } from '~/utils/site-header'
import { buildLoginHref } from '~/utils/sso-handoff'

// Resolve the session before the guest check below reads it.
await useAuthSession()

const { hasAccount, claimIfPending } = useGuestSession()

// Fold in anything the visitor wrote as a guest. Silent — from their side
// nothing happened, their feedback is simply still theirs.
//
// On load, not on every flip of `hasAccount`: signing in switches accounts, and
// the auth-reload plugin hard-reloads the app on that switch. A claim started in
// the realm being replaced has its request aborted mid-navigation, so it never
// sees its own answer and never clears the token — and the realm that comes up
// next claims all over again. Claiming on load puts it in the realm that lives
// long enough to finish, and every sign-in path ends in one.
if (hasAccount.value) claimIfPending()
// MarketData: a first sign-in no longer reloads (auth-reload reloads only when
// one account replaces another; ~/utils/session-refresh), so a sign-in on the
// page (the background SSO handoff, the in-page modal) claims when it lands.
// Nothing replaces this realm then, so the claim lives to see its answer; and
// if an account switch does reload, the token is kept until a claim answers.
watch(hasAccount, (now) => {
  if (now) claimIfPending()
})

const { isOpen: showLoginModal } = useLoginModal()

// MarketData: the public pages wear the marketdata.app site header (the shared
// kit, @marketdataapp/ui), so the board reads as a part of the website. Its
// links all lead to www; the board's own navigation is the BoardBar below it.
const config = useRuntimeConfig().public
const route = useRoute()
const requestUrl = useRequestURL()
const websiteUrl = String(config.websiteUrl || 'https://www.marketdata.app').replace(/\/+$/, '')

// The drawer's fallback "Log In" link: the dashboard login, which returns to
// this page. The account control's own links and this one get the current
// page as their return address again just before use (onHeaderEvent).
//
// Rendered once per layout instance, on the server and identically during
// hydration (no hash: the server never sees one). Never re-render it: a new
// string would replace the header's DOM under the listeners initHeader binds,
// and under the account control. No board path matches a www link, so the
// path at setup time marks nothing that a later one would not.
const headerHtml = siteHeaderHtml({
  currentPath: route.path,
  websiteOrigin: websiteUrl,
  loginUrl: buildLoginHref(String(config.amemberLoginUrl), `${requestUrl.origin}${requestUrl.pathname}${requestUrl.search}`),
  signupUrl: `${websiteUrl}/signup/`,
})

const headerHost = ref<HTMLElement | null>(null)

// The account control in the header's #user-profile slot: the kit's control
// (it asks the dashboard who is logged in), or, for the board admin's own
// /team-login session, the board identity (BoardAdminControl, teleported in).
// Then the background handoff and the logout sync (useAmemberSession).
const amember = useAmemberSession()
const adminControl = ref(false)
const HEADER_EVENTS = ['pointerdown', 'focusin', 'click'] as const

let cleanupHeader: (() => void) | undefined
let cleanupControl: (() => void) | undefined
onMounted(() => {
  const root = headerHost.value?.querySelector<HTMLElement>('.site-header') ?? undefined
  // userProfile: false — the board owns #user-profile (the header slot), so the
  // header never renders into it or clears it. The board bar sits outside
  // <main> and goes inert with it while the drawer is open.
  cleanupHeader = initHeader({ root, userProfile: false, inert: 'main, footer, #board-bar' })
  for (const type of HEADER_EVENTS) root?.addEventListener(type, amember.onHeaderEvent, true)

  const slot = root?.querySelector<HTMLElement>('#user-profile')
  if (amember.isLocalSession.value) {
    if (slot) {
      slot.style.minWidth = 'auto'
      adminControl.value = true
    }
  }
  else if (slot) {
    cleanupControl = amember.mountControl(slot)
  }
  amember.runHandoff()
})
onBeforeUnmount(() => {
  const root = headerHost.value?.querySelector('.site-header')
  for (const type of HEADER_EVENTS) root?.removeEventListener(type, amember.onHeaderEvent, true)
  cleanupControl?.()
  cleanupHeader?.()
})
</script>

<template>
  <div class="min-h-screen flex flex-col bg-background text-foreground font-body">
    <!-- eslint-disable-next-line vue/no-v-html -- trusted kit markup, rendered from constants -->
    <div ref="headerHost" class="contents" v-html="headerHtml" />
    <Teleport v-if="adminControl" to="#user-profile">
      <BoardAdminControl />
    </Teleport>
    <BoardBar />

    <!-- Login modal (global, controlled via useLoginModal) -->
    <LoginModal v-model:open="showLoginModal" />

    <main id="main-content" class="flex-1 w-full max-w-[1200px] mx-auto flex flex-col md:flex-row gap-8 px-4 md:px-6 lg:px-10 pt-6 md:pt-8 pb-6 md:pb-8">
      <slot />
    </main>
  </div>
</template>
