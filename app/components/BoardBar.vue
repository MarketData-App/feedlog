<script setup lang="ts">
import type { AuthSession } from '~/composables/useAuth'

// MarketData: the board's own navigation, a slim bar under the marketdata.app
// site header (which links only website pages). Feature Requests, Roadmap,
// New request, and Admin for the org's owners and managers; plus the board's
// language switch and, for now, its sign-in / account menu.
const localePath = useLocalePath()
const route = useRoute()
const routeBaseName = useRouteBaseName()
const portalOrg = usePortalOrg()
const orgCtx = useOrgContext()
// The default layout has awaited useAuthSession(); read its answer, no refetch.
const { data: session } = useNuxtData<AuthSession | null>('auth-session')
const { isGuest } = useGuestSession()
const newRequest = useNewRequest()

const signedIn = computed(() => !isGuest.value && !!session.value?.user)
const canAdmin = computed(() =>
  signedIn.value && (orgCtx.value.role === 'owner' || orgCtx.value.role === 'manager'))

// A post page belongs to the feature-request list it was opened from.
const LIST_ROUTES = new Set(['index', 'p-slug'])
const baseName = computed(() => String(routeBaseName(route) ?? ''))
const links = computed(() => [
  { key: 'nav.featureRequests', to: '/', icon: 'lucide:message-square', active: LIST_ROUTES.has(baseName.value) },
  { key: 'nav.roadmap', to: '/roadmap', icon: 'lucide:map', active: baseName.value === 'roadmap' },
  // Off on MarketData today; kept so enabling the module needs no layout change.
  ...(portalOrg.value.modules.helpCenter
    ? [{ key: 'nav.helpCenter', to: '/help', icon: 'lucide:book-open', active: baseName.value.startsWith('help') }]
    : []),
])
</script>

<template>
  <nav
    id="board-bar"
    :aria-label="$t('nav.boardBar')"
    class="board-bar md:sticky z-30 w-full border-b border-border bg-card/95 backdrop-blur-md"
  >
    <div class="max-w-[1200px] mx-auto h-11 flex items-center justify-between gap-3 px-4 md:px-6 lg:px-10">
      <ul class="flex items-center gap-4 sm:gap-6 min-w-0 overflow-x-auto [scrollbar-width:none]">
        <li v-for="item in links" :key="item.to" class="shrink-0">
          <NuxtLink
            :to="localePath(item.to)"
            class="flex items-center gap-1.5 h-11 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors"
            :class="item.active ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'"
            :aria-current="item.active ? 'page' : undefined"
          >
            <!-- The wrapper hides it: the icon's own display rule beats a class on <Icon>. -->
            <span class="hidden sm:inline-flex"><Icon :name="item.icon" size="16" /></span>
            {{ $t(item.key) }}
          </NuxtLink>
        </li>
      </ul>

      <div class="flex items-center gap-1 sm:gap-2 shrink-0">
        <button
          type="button"
          class="flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          :aria-label="$t('board.newRequest')"
          data-fdl-action="feedback_composer_open"
          data-fdl-source="board-bar"
          @click="newRequest.request()"
        >
          <Icon name="lucide:plus" size="16" />
          <span class="hidden sm:inline">{{ $t('board.newRequest') }}</span>
        </button>
        <NuxtLink
          v-if="canAdmin"
          :to="localePath('/dashboard')"
          class="flex items-center gap-1.5 h-8 px-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          :aria-label="$t('nav.admin')"
        >
          <Icon name="lucide:layout-dashboard" size="16" />
          <span class="hidden sm:inline">{{ $t('nav.admin') }}</span>
        </NuxtLink>
        <LocaleSwitcher />
        <BoardAccountMenu />
      </div>
    </div>
  </nav>
</template>

<style scoped>
/* Sticks under the site header's fixed 60px bar from the tablet width up; on a
   phone it scrolls away with the page to leave the screen to the list. */
.board-bar {
  top: 60px;
}
.board-bar ul::-webkit-scrollbar {
  display: none;
}
</style>
