<script setup lang="ts">
import type { AuthSession } from '~/composables/useAuth'
import { resolveAttachmentUrl } from '~/utils/attachment'

// MarketData: the board's own sign-in and account menu, moved out of the old
// FeedLog header into the board bar. Interim: the marketdata.app account control
// (the header's #user-profile) takes over sign-in and sign-out once the SSO
// handoff lands; until then this keeps FeedLog's sign-in (useLoginModal → the
// aMember feedlog-sso plugin) and sign-out reachable on every public page.

const { signOut } = useAuth()
// The default layout has awaited useAuthSession(); read its answer, no refetch.
const { data: session } = useNuxtData<AuthSession | null>('auth-session')
const localePath = useLocalePath()

const { isGuest } = useGuestSession()
// A guest is not an account: keep offering sign-in, no avatar or sign-out.
const user = computed(() => isGuest.value ? undefined : session.value?.user)

// An SSO session carries its real member role inside its org, but may not change
// the global user record — hence the password entry re-prompts.
const isSsoSession = computed(
  () => !!(session.value as { session?: { ssoOrgId?: string | null } } | null)?.session?.ssoOrgId,
)

const initials = computed(() => (user.value?.name || '').slice(0, 2).toUpperCase())
const avatarError = ref(false)
const avatarUrl = computed(() => resolveAttachmentUrl(user.value?.image))
watch(user, () => { avatarError.value = false })

const { open: openLoginModal, ssoMode } = useLoginModal()
// MarketData SSO mode: profile and password live in the customer's MarketData
// account, so an SSO session gets no entry that leads to a form here.
const showCredentialItems = computed(() => !(ssoMode && isSsoSession.value))
const showChangePassword = ref(false)
const showEditProfile = ref(false)

function onChangePassword() {
  if (isSsoSession.value) return openLoginModal(LOCAL_AUTH_REASON)
  showChangePassword.value = true
}

function onEditProfile() {
  if (isSsoSession.value) return openLoginModal(LOCAL_AUTH_REASON)
  showEditProfile.value = true
}

async function handleSignOut() {
  await signOut()
  window.location.href = localePath('/')
}
</script>

<template>
  <DropdownMenu v-if="user">
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        :aria-label="user.name"
        class="flex items-center rounded-full border border-border bg-card hover:border-primary transition-colors focus:outline-none p-0.5"
      >
        <Avatar class="w-7 h-7">
          <img v-if="avatarUrl && !avatarError" :src="avatarUrl" :alt="user.name" class="aspect-square size-full rounded-full object-cover" referrerpolicy="no-referrer" @error="avatarError = true">
          <AvatarFallback v-else class="bg-accent text-accent-foreground text-xs font-bold">
            {{ initials }}
          </AvatarFallback>
        </Avatar>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-48">
      <DropdownMenuLabel class="font-normal">
        <div class="flex flex-col space-y-1">
          <p class="text-sm font-medium">{{ user.name }}</p>
          <p class="text-xs text-muted-foreground truncate">{{ user.email }}</p>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem v-if="showCredentialItems" @click="onEditProfile">
        <Icon name="lucide:user-round-pen" size="16" class="mr-2" />
        {{ $t('nav.editProfile') }}
      </DropdownMenuItem>
      <DropdownMenuItem v-if="showCredentialItems" @click="onChangePassword">
        <Icon name="lucide:key-round" size="16" class="mr-2" />
        {{ $t('nav.changePassword') }}
      </DropdownMenuItem>
      <DropdownMenuItem @click="handleSignOut">
        <Icon name="lucide:log-out" size="16" class="mr-2" />
        {{ $t('common.signOut') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  <button
    v-else
    type="button"
    class="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
    data-board-sign-in
    @click="openLoginModal()"
  >
    <Icon name="lucide:log-in" size="16" />
    <span class="hidden sm:inline">{{ $t('common.signIn') }}</span>
  </button>

  <ChangePasswordDialog v-model:open="showChangePassword" />
  <EditProfileDialog v-model:open="showEditProfile" />
</template>
