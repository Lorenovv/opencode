import { onMount } from "solid-js"
import { useServerSDK } from "@/context/server-sdk"

// The Gloam gateway exposes a `gloam` provider via its
// /.well-known/opencode document. We connect it automatically using the signed
// Gloam session token as the key, so users never have to paste an API key for
// the managed provider. The provider only appears in the provider list and
// model picker once `auth.set` has run, which is why we do it at boot.
const GLOAM_GATEWAY_URL = "https://gloam-gateway.vercel.app"
const GLOAM_WELLKNOWN_ENV = "GLOAM_API_KEY"

type GloamBridge = { gloamAuth?: { getToken?: () => Promise<string | null> } }

// Desktop-only: once the user has a Gloam session, wire up the Gloam provider.
// On web (no desktop bridge) this is a no-op.
export function GloamProviderSync() {
  const serverSDK = useServerSDK()

  onMount(() => {
    const bridge = (window as unknown as { api?: GloamBridge }).api
    const getToken = bridge?.gloamAuth?.getToken
    if (!getToken) return

    void (async () => {
      let token: string | null = null
      try {
        token = await getToken()
      } catch {
        return
      }
      if (!token) return
      try {
        await serverSDK.client.auth.set({
          providerID: GLOAM_GATEWAY_URL,
          auth: { type: "wellknown", key: GLOAM_WELLKNOWN_ENV, token },
        })
        await serverSDK.client.global.dispose()
      } catch {
        // Best effort: the provider can still be connected manually in Settings.
      }
    })()
  })

  return null
}
