import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Tag } from "@opencode-ai/ui/tag"
import { showToast } from "@/utils/toast"
import { useProviders } from "@/hooks/use-providers"
import { createMemo, type Component, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { DialogCustomProvider } from "./dialog-custom-provider"
import { SettingsList } from "./settings-list"
import { SettingsServerPicker, SettingsServerScope } from "./settings-server-picker"

type ProviderSource = "env" | "api" | "config" | "custom"
type ProviderItem = ReturnType<ReturnType<typeof useProviders>["connected"]>[number]

const GLOAM_PROVIDER_ID = "gloam"

export const SettingsProviders: Component = () => {
  return (
    <SettingsServerScope>
      <SettingsProvidersContent />
    </SettingsServerScope>
  )
}

const SettingsProvidersContent: Component = () => {
  const dialog = useDialog()
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const providers = useProviders()

  const source = (item: ProviderItem): ProviderSource | undefined => {
    if (!("source" in item)) return
    const value = item.source
    if (value === "env" || value === "api" || value === "config" || value === "custom") return value
    return
  }

  const isConfigCustom = (providerID: string) => {
    const provider = serverSync.data.config.provider?.[providerID]
    if (!provider) return false
    if (provider.npm !== "@ai-sdk/openai-compatible") return false
    if (!provider.models || Object.keys(provider.models).length === 0) return false
    return true
  }

  // Gloam fork: only surface the managed Gloam provider and the user's own
  // (custom / BYO) providers. The native opencode catalog is intentionally
  // hidden so users either use Gloam or bring their own key.
  const isAllowed = (item: ProviderItem) =>
    item.id === GLOAM_PROVIDER_ID || source(item) === "custom" || isConfigCustom(item.id)

  const connected = createMemo(() => providers.connected().filter(isAllowed))

  const type = (item: ProviderItem) => {
    if (item.id === GLOAM_PROVIDER_ID) return language.t("settings.providers.tag.other")
    const current = source(item)
    if (current === "env") return language.t("settings.providers.tag.environment")
    if (current === "api") return language.t("provider.connect.method.apiKey")
    if (current === "config") {
      if (isConfigCustom(item.id)) return language.t("settings.providers.tag.custom")
      return language.t("settings.providers.tag.config")
    }
    if (current === "custom") return language.t("settings.providers.tag.custom")
    return language.t("settings.providers.tag.other")
  }

  // The managed Gloam provider is connected automatically and cannot be
  // disconnected from here; environment-provided providers are also fixed.
  const canDisconnect = (item: ProviderItem) => item.id !== GLOAM_PROVIDER_ID && source(item) !== "env"

  const disableProvider = async (providerID: string, name: string) => {
    const before = serverSync.data.config.disabled_providers ?? []
    const next = before.includes(providerID) ? before : [...before, providerID]
    serverSync.set("config", "disabled_providers", next)

    await serverSync
      .updateConfig({ disabled_providers: next })
      .then(() => {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.disconnect.toast.disconnected.title", { provider: name }),
          description: language.t("provider.disconnect.toast.disconnected.description", { provider: name }),
        })
      })
      .catch((err: unknown) => {
        serverSync.set("config", "disabled_providers", before)
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
  }

  const disconnect = async (providerID: string, name: string) => {
    if (isConfigCustom(providerID)) {
      await serverSDK.client.auth.remove({ providerID }).catch(() => undefined)
      await disableProvider(providerID, name)
      return
    }
    await serverSDK.client.auth
      .remove({ providerID })
      .then(async () => {
        await serverSDK.client.global.dispose()
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.disconnect.toast.disconnected.title", { provider: name }),
          description: language.t("provider.disconnect.toast.disconnected.description", { provider: name }),
        })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex items-center justify-between gap-4 pt-6 pb-8 max-w-[720px]">
          <h2 class="text-16-medium text-text-strong">{language.t("settings.providers.title")}</h2>
          <SettingsServerPicker />
        </div>
      </div>

      <div class="flex flex-col gap-8 max-w-[720px]">
        <div class="flex flex-col gap-1" data-component="connected-providers-section">
          <h3 class="text-14-medium text-text-strong pb-2">{language.t("settings.providers.section.connected")}</h3>
          <SettingsList>
            <Show
              when={connected().length > 0}
              fallback={
                <div class="py-4 text-14-regular text-text-weak">
                  {language.t("settings.providers.connected.empty")}
                </div>
              }
            >
              <For each={connected()}>
                {(item) => (
                  <div class="group flex flex-wrap items-center justify-between gap-4 min-h-16 py-3 border-b border-border-weak-base last:border-none">
                    <div class="flex items-center gap-3 min-w-0">
                      <ProviderIcon id={item.id} class="size-5 shrink-0 icon-strong-base" />
                      <span class="text-14-medium text-text-strong truncate">{item.name}</span>
                      <Tag>{type(item)}</Tag>
                    </div>
                    <Show when={canDisconnect(item)}>
                      <Button size="large" variant="ghost" onClick={() => void disconnect(item.id, item.name)}>
                        {language.t("common.disconnect")}
                      </Button>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </SettingsList>
        </div>

        <div class="flex flex-col gap-1">
          <SettingsList>
            <div
              class="flex items-center justify-between gap-4 min-h-16 border-b border-border-weak-base last:border-none flex-wrap py-3"
              data-component="custom-provider-section"
            >
              <div class="flex flex-col min-w-0">
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ProviderIcon id="synthetic" class="size-5 shrink-0 icon-strong-base" />
                  <span class="text-14-medium text-text-strong">{language.t("provider.custom.title")}</span>
                  <Tag>{language.t("settings.providers.tag.custom")}</Tag>
                </div>
                <span class="text-12-regular text-text-weak pl-8">
                  {language.t("settings.providers.custom.description")}
                </span>
              </div>
              <Button
                size="large"
                variant="secondary"
                icon="plus-small"
                onClick={() => {
                  dialog.show(() => <DialogCustomProvider back="close" />)
                }}
              >
                {language.t("common.connect")}
              </Button>
            </div>
          </SettingsList>
        </div>
      </div>
    </div>
  )
}
