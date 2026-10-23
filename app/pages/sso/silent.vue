<script setup lang="ts">
import { SILENT_MESSAGE_TYPE } from '~/utils/sso-handoff'

// /sso/silent — the end of the hidden-iframe SSO handoff (spec §11). The board
// page loads the aMember feedlog-sso plugin in a hidden frame with
// return_to=/sso/silent; /api/sso/jwt sets the board session and lands here.
// This page only tells its parent, on the board's own origin and no other,
// that the round trip is done; the parent then reads its session itself, so
// the message carries nothing. Framable by the board origin only
// (server/middleware/01-frame-ancestors.ts).
//
// No layout (no header, no handoff of its own) and no auth middleware.
definePageMeta({ layout: false, middleware: [] })
useHead({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

onMounted(() => {
  if (window.parent !== window) {
    window.parent.postMessage({ type: SILENT_MESSAGE_TYPE }, window.location.origin)
    return
  }
  // Opened on its own (not in the frame): nothing to report, go to the board.
  navigateTo('/', { replace: true })
})
</script>

<template>
  <div />
</template>
