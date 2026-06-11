import { onMount } from "solid-js"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"

// The Gloam gateway exposes a `gloam` provider via its
// /.well-known/opencode document. We connect it automatically using the signed
// Gloam session token as the key, so users never have to paste an API key for
// the managed provider. The provider only appears in the provider list and
// model picker once `auth.set` has run AND the client provider snapshot has
// been refetched, which is why we trigger an explicit refetch at boot.
const GLOAM_GATEWAY_URL = "https://gloam-gateway.vercel.app"
const GLOAM_WELLKNOWN_ENV = "GLOAM_API_KEY"

// Native opencode providers that ship in the catalog without authentication.
// Gloam is its own product (a fork), so we always hide these. Users either use
// the managed Gloam provider or bring their own key via a custom provider.
const HIDDEN_NATIVE_PROVIDERS = ["opencode", "opencode-go"]

type GloamBridge = { gloamAuth?: { getToken?: () => Promise<string | null> } }

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

      try {
        // Connect the managed Gloam provider using the signed session token.
        if (token) {
          await serverSDK.client.auth.set({
            providerID: GLOAM_GATEWAY_URL,
            auth: { type: "wellknown", key: GLOAM_WELLKNOWN_ENV, token },
          })
          await serverSDK.client.global.dispose()
        }

        // Hide the native opencode providers and force a provider refetch. This
        // runs after auth.set so the refetched provider snapshot already
        // includes Gloam. updateConfig's onSuccess invalidates the provider
        // queries, so Gloam appears immediately without a manual restart.
        const before = serverSync.data.config.disabled_providers ?? []
        const next = [...before]
        for (const id of HIDDEN_NATIVE_PROVIDERS) {
          if (!next.includes(id)) next.push(id)
        }
        await serverSync.updateConfig({ disabled_providers: next })
      } catch {
        // Best effort: the provider can still be connected manually in Settings.
      }
    })()
  })

  return null
}
