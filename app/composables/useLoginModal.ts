import { toast } from 'vue-sonner'
import { signInAction } from '~/utils/sso-login-url'

// `reason` holds an i18n key rather than rendered text: the modal is mounted
// elsewhere and may render in a different locale than the caller.
//
// With `runtimeConfig.public.ssoLoginUrl` set (NUXT_PUBLIC_SSO_LOGIN_URL, "SSO
// mode"), open() never shows the form: a sign-in goes to that login page with
// the current URL as return_to, and a prompt for a direct sign-in
// (LOCAL_AUTH_REASON) shows a notice instead. The board admin signs in at
// /team-login, which mounts the modal directly and does not go through open().
export function useLoginModal() {
  const nuxtApp = useNuxtApp()
  const isOpen = useState('login-modal', () => false)
  const reason = useState<string | null>('login-modal-reason', () => null)
  const ssoLoginUrl = useRuntimeConfig().public.ssoLoginUrl
  return {
    isOpen,
    reason,
    ssoMode: !!ssoLoginUrl,
    open: (reasonKey?: string) => {
      const action = signInAction(ssoLoginUrl, import.meta.client ? window.location.href : '', reasonKey === LOCAL_AUTH_REASON)
      if (action.kind === 'redirect') {
        if (import.meta.client) window.location.assign(action.url)
        return
      }
      if (action.kind === 'notice') {
        if (import.meta.client) toast.info(nuxtApp.$i18n.t(SSO_ACCOUNT_NOTICE))
        return
      }
      reason.value = reasonKey ?? null
      isOpen.value = true
    },
  }
}

export const LOCAL_AUTH_REASON = 'auth.localAuthRequired'
const SSO_ACCOUNT_NOTICE = 'auth.ssoAccountManaged'

// better-auth's fetch wrapper and plain $fetch nest the h3 error body
// differently, and both reach here.
function extractErrorCode(payload: unknown): string | undefined {
  const at = (o: unknown, ...path: string[]) => path.reduce<unknown>(
    (v, k) => (v && typeof v === 'object') ? (v as Record<string, unknown>)[k] : undefined,
    o,
  )
  const code = at(payload, 'data', 'code')
    ?? at(payload, 'code')
    ?? at(payload, '_data', 'data', 'code')
    ?? at(payload, 'response', '_data', 'data', 'code')
  return typeof code === 'string' ? code : undefined
}

// Returns whether it handled the error, so callers can skip their own toast.
export function promptLocalAuthIfRequired(payload: unknown): boolean {
  if (!import.meta.client) return false
  if (extractErrorCode(payload) !== 'LOCAL_AUTH_REQUIRED') return false
  useLoginModal().open(LOCAL_AUTH_REASON)
  return true
}
