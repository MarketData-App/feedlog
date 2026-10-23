<script setup lang="ts">
import { initHeader } from '@marketdataapp/ui/header-client'
import { siteHeaderHtml } from '~/utils/site-header'

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

const { isOpen: showLoginModal } = useLoginModal()

// MarketData: the public pages wear the marketdata.app site header (the shared
// kit, @marketdataapp/ui), so the board reads as a part of the website. Its
// links all lead to www; the board's own navigation is the BoardBar below it.
const config = useRuntimeConfig().public
const route = useRoute()
const requestUrl = useRequestURL()
const websiteUrl = String(config.websiteUrl || 'https://www.marketdata.app').replace(/\/+$/, '')

// The drawer's fallback "Log In" link: the dashboard login, which returns to
// this page. The return address is refreshed at click time (onHeaderClick), as
// the page may have changed since the header was rendered.
function loginUrlFor(pageUrl: string): string {
  const url = new URL(String(config.amemberLoginUrl))
  url.searchParams.set('amember_redirect_url', pageUrl)
  return url.href
}

// Rendered once per layout instance, on the server and identically during
// hydration (no hash: the server never sees one). Never re-render it: a new
// string would replace the header's DOM under the listeners initHeader binds,
// and under the account control. No board path matches a www link, so the
// path at setup time marks nothing that a later one would not.
const headerHtml = siteHeaderHtml({
  currentPath: route.path,
  websiteOrigin: websiteUrl,
  loginUrl: loginUrlFor(`${requestUrl.origin}${requestUrl.pathname}${requestUrl.search}`),
  signupUrl: `${websiteUrl}/signup/`,
})

const headerHost = ref<HTMLElement | null>(null)

function onHeaderClick(event: MouseEvent) {
  const link = (event.target as Element | null)?.closest?.('a')
  if (!link) return
  const login = new URL(String(config.amemberLoginUrl))
  const target = new URL(link.href, window.location.href)
  if (target.origin !== login.origin || target.pathname !== login.pathname) return
  link.href = loginUrlFor(window.location.href)
}

let cleanupHeader: (() => void) | undefined
onMounted(() => {
  const root = headerHost.value?.querySelector<HTMLElement>('.site-header') ?? undefined
  // userProfile: false — the board owns #user-profile (the header slot), so the
  // header never renders into it or clears it. The board bar sits outside
  // <main> and goes inert with it while the drawer is open.
  cleanupHeader = initHeader({ root, userProfile: false, inert: 'main, footer, #board-bar' })
  root?.addEventListener('click', onHeaderClick)
})
onBeforeUnmount(() => {
  headerHost.value?.querySelector('.site-header')?.removeEventListener('click', onHeaderClick as EventListener)
  cleanupHeader?.()
})
</script>

<template>
  <div class="min-h-screen flex flex-col bg-background text-foreground font-body">
    <!-- eslint-disable-next-line vue/no-v-html -- trusted kit markup, rendered from constants -->
    <div ref="headerHost" class="contents" v-html="headerHtml" />
    <BoardBar />

    <!-- Login modal (global, controlled via useLoginModal) -->
    <LoginModal v-model:open="showLoginModal" />

    <main id="main-content" class="flex-1 w-full max-w-[1200px] mx-auto flex flex-col md:flex-row gap-8 px-4 md:px-6 lg:px-10 pt-6 md:pt-8 pb-6 md:pb-8">
      <slot />
    </main>
  </div>
</template>
