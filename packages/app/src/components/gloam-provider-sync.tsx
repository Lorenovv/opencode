import { onMount } from "solid-js"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"

// The Gloam gateway exposes a `gloam` provider via its
// /.well-known/opencode document. We connect it automatically using the signed
// Gloam session token as the key, so users never have to paste an API key for
// the managed provider.
//
// Connecting is a two-step dance on the sidecar: `auth.set` writes the
// credential, then `global.dispose()` makes the server reload its provider
// catalog from the well-known document. That reload is asynchronous, so a
// single refetch right after dispose can race ahead of it and miss Gloam. We
// therefore re-check the provider snapshot a few times until Gloam shows up.
const GLOAM_GATEWAY_URL = "https://gateway.gloam.site"
const GLOAM_WELLKNOWN_ENV = "GLOAM_API_KEY"
const GLOAM_PROVIDER_ID = "gloam"

// Native opencode providers that ship in the catalog without authentication.
// Gloam is its own product (a fork), so we always hide these. Users either use
// the managed Gloam provider or bring their own key via a custom provider.
const HIDDEN_NATIVE_PROVIDERS = ["opencode", "opencode-go"]

const RECONNECT_ATTEMPTS = 8
const RECONNECT_DELAY_MS = 750

type GloamBridge = { gloamAuth?: { getToken?: () => Promise<string | null> } }

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// Desktop-only: once the user has a Gloam session, wire up the Gloam provider
// and hide the native opencode catalog. On web (no desktop bridge) we still
// hide the native providers so the experience stays consistent.
export function GloamProviderSync() {
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()

  onMount(() => {
    void (async () => {
      const bridge = (window as unknown as { api?: GloamBridge }).api
      const getToken = bridge?.gloamAuth?.getToken

      let token: string | null = null
      if (getToken) {
        try {
          token = await getToken()
        } catch {
          token = null
        }
      }

      const gloamConnected = () => {
        const all = serverSync.data.provider.all
        return typeof all?.has === "function" ? all.has(GLOAM_PROVIDER_ID) : false
      }

      // Compute the disabled_providers list; reused as a cheap way to force a
      // provider refetch, since updateConfig invalidates the provider query.
      const hideNatives = () => {
        const before = serverSync.data.config.disabled_providers ?? []
        const next = [...before]
        for (const id of HIDDEN_NATIVE_PROVIDERS) {
          if (!next.includes(id)) next.push(id)
        }
        return next
      }

      try {
        // Always hide the native opencode providers, even on web / logged out.
        await serverSync.updateConfig({ disabled_providers: hideNatives() })

        // Without a session token we cannot connect the managed provider; the
        // user can still paste a key manually or add their own provider.
        if (!token) return

        // Always (re)write the credential with the *current* session token and
        // reload the catalog -- even if Gloam already appears connected.
        //
        // The sidecar persists the previously-written credential in its own
        // auth store (separate from the desktop's token store). If we skip this
        // when already connected, a rotated token is never propagated: after a
        // re-login or a backend signing-secret change the sidecar keeps sending
        // the stale token, and every chat request fails the gateway's offline
        // verification with "Invalid or inactive Gloam session". Re-setting the
        // credential on each launch keeps the sidecar in sync with the latest
        // token. `auth.set` is idempotent, so this is a no-op when unchanged.
        await serverSDK.client.auth.set({
          providerID: GLOAM_GATEWAY_URL,
          auth: { type: "wellknown", key: GLOAM_WELLKNOWN_ENV, token },
        })
        await serverSDK.client.global.dispose()

        // The dispose-triggered reload is async; nudge the provider snapshot
        // until Gloam appears or we run out of attempts.
        for (let attempt = 0; attempt < RECONNECT_ATTEMPTS && !gloamConnected(); attempt++) {
          await delay(RECONNECT_DELAY_MS)
          await serverSync.updateConfig({ disabled_providers: hideNatives() })
        }
      } catch {
        // Best effort: the provider can still be connected manually in Settings.
      }
    })()
  })

  return null
}
