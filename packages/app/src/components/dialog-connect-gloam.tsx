import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { useMutation } from "@tanstack/solid-query"
import { createSignal } from "solid-js"
import { showToast } from "@/utils/toast"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useLanguage } from "@/context/language"
import { DialogSelectProvider } from "./dialog-select-provider"

// Gloam connects through the gateway's /.well-known/opencode document, so the
// provider definition (models, baseURL) stays dynamic and never needs a client
// rebuild. We store a `wellknown` auth entry keyed by the gateway URL; opencode
// then injects the pasted token into the GLOAM_API_KEY env var when fetching the
// well-known config.
const GATEWAY_URL = "https://gloam-gateway.vercel.app"
const LOGIN_URL = GATEWAY_URL
const WELLKNOWN_ENV = "GLOAM_API_KEY"

type Props = {
  back?: "providers" | "close"
}

export function DialogConnectGloam(props: Props) {
  const dialog = useDialog()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const language = useLanguage()

  const [token, setToken] = createSignal("")

  const goBack = () => {
    if (props.back === "close") {
      dialog.close()
      return
    }
    dialog.show(() => <DialogSelectProvider />)
  }

  const connectMutation = useMutation(() => ({
    mutationFn: async (key: string) => {
      await serverSDK.client.auth.set({
        providerID: GATEWAY_URL,
        auth: {
          type: "wellknown",
          key: WELLKNOWN_ENV,
          token: key,
        },
      })
      await serverSDK.client.global.dispose()
    },
    onSuccess: () => {
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: "Gloam",
        description: "You're connected to Gloam.",
      })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    },
  }))

  const submit = (e: SubmitEvent) => {
    e.preventDefault()
    const key = token().trim()
    if (!key || connectMutation.isPending) return
    connectMutation.mutate(key)
  }

  return (
    <Dialog
      title={
        <IconButton
          tabIndex={-1}
          icon="arrow-left"
          variant="ghost"
          onClick={goBack}
          aria-label={language.t("common.goBack")}
        />
      }
      transition
    >
      <div class="flex flex-col gap-6 px-2.5 pb-3 overflow-y-auto max-h-[60vh]">
        <div class="px-2.5 flex gap-4 items-center">
          <ProviderIcon id="gloam" class="size-5 shrink-0 icon-strong-base" />
          <div class="text-16-medium text-text-strong">Gloam</div>
        </div>

        <div class="px-2.5 flex flex-col gap-6">
          <p class="text-14-regular text-text-base">
            Sign in on the Gloam website to get your access key, then paste it below to connect.
          </p>

          <Button
            type="button"
            size="large"
            variant="primary"
            class="w-auto self-start"
            onClick={() => platform.openLink(LOGIN_URL)}
          >
            Sign in to Gloam
          </Button>

          <form onSubmit={submit} class="flex flex-col gap-6">
            <TextField
              autofocus
              label="Access key"
              placeholder="gloam-..."
              value={token()}
              onChange={setToken}
            />
            <Button
              class="w-auto self-start"
              type="submit"
              size="large"
              variant="primary"
              disabled={connectMutation.isPending}
            >
              {connectMutation.isPending ? language.t("common.saving") : language.t("common.submit")}
            </Button>
          </form>
        </div>
      </div>
    </Dialog>
  )
}
