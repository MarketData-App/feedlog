<script setup lang="ts">
import type { AuthSession } from '~/composables/useAuth'
import { resolveAttachmentUrl } from '~/utils/attachment'

// MarketData: the account control for the board admin's own sign-in
// (/team-login, a local session). It takes the place of the kit's control in
// the header's #user-profile slot and wears the kit's classes, so it looks
// like the marketdata.app control: the board identity, a link to the admin
// pages, and sign-out. Profile and password stay in the dashboard's own menu.
const { data: session } = useNuxtData<AuthSession | null>('auth-session')
const { signOut } = useAuth()
const localePath = useLocalePath()

const user = computed(() => session.value?.user)
const avatarUrl = computed(() => resolveAttachmentUrl(user.value?.image))
const avatarError = ref(false)
const open = ref(false)
const root = ref<HTMLElement | null>(null)

function onDocumentClick(event: MouseEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}
onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})

async function handleSignOut() {
  open.value = false
  await signOut()
  window.location.href = localePath('/')
}
</script>

<template>
  <div v-if="user" ref="root" class="user-profile-wrapper" data-board-admin-control>
    <button
      type="button"
      class="block rounded-full p-0 border-0 bg-transparent cursor-pointer"
      :aria-label="user.name"
      :aria-expanded="open"
      @click.stop="open = !open"
    >
      <img
        v-if="avatarUrl && !avatarError"
        :src="avatarUrl"
        :alt="user.name"
        class="user-profile-avatar user-profile-avatar--img"
        referrerpolicy="no-referrer"
        @error="avatarError = true"
      >
      <span v-else class="user-profile-avatar user-profile-avatar--placeholder" role="img" :aria-label="user.name">
        <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>
      </span>
    </button>
    <div class="user-profile-dropdown" :class="{ hidden: !open }">
      <div class="user-profile-dropdown-header">
        <div class="user-profile-dropdown-name">{{ user.name }}</div>
        <div class="user-profile-dropdown-email">{{ user.email }}</div>
        <div class="user-profile-dropdown-email">{{ $t('nav.boardAdmin') }}</div>
      </div>
      <ul class="user-profile-dropdown-menu">
        <li>
          <NuxtLink :to="localePath('/dashboard')" class="user-profile-dropdown-link" @click="open = false">
            {{ $t('nav.admin') }}
          </NuxtLink>
        </li>
        <li>
          <a href="#" class="user-profile-dropdown-signout" @click.prevent="handleSignOut">{{ $t('common.signOut') }}</a>
        </li>
      </ul>
    </div>
  </div>
</template>
