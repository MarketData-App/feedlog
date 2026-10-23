<script setup lang="ts">
// MarketData: the board admin's own email/password sign-in. Customers sign in
// through aMember (every "Sign in" redirects there), so this page is not linked
// anywhere and is kept out of search and the sitemap (routeRules in
// nuxt.config.ts). Email sign-up works only for SYSTEM_ADMIN_EMAILS (server
// side, see server/utils/signup-allowlist.ts).
//
// `layout: false` keeps the board chrome, and with it the redirecting
// "Sign in" button and the global modal, off this page.
definePageMeta({ layout: false })

const { t } = useI18n()
const localePath = useLocalePath()
useHead({
  title: () => t('auth.signInEmail.title'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { data: session } = await useAuthSession()
const open = ref(true)

// A direct (not guest, not product-SSO) session is what this page is for; once
// there is one, go on to the dashboard. Its middleware sends a user without a
// staff role back to the board.
const isDirectUser = computed(() => {
  const s = session.value as { user?: { isAnonymous?: boolean | null }, session?: { ssoOrgId?: string | null } } | null
  return !!s?.user && !s.user.isAnonymous && !s.session?.ssoOrgId
})

function goToDashboard() {
  return navigateTo(localePath('/dashboard'), { replace: true })
}

if (isDirectUser.value) await goToDashboard()
watch(isDirectUser, (value) => {
  if (value) goToDashboard()
})
</script>

<template>
  <div class="min-h-screen bg-background font-body">
    <LoginModal v-model:open="open" team />
  </div>
</template>
