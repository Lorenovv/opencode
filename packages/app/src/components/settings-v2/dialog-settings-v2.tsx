import { Component, Show, createResource } from "solid-js"
import { Dialog } from "@opencode-ai/ui/v2/dialog-v2"
import { TabsV2 } from "@opencode-ai/ui/v2/tabs-v2"
import { Icon } from "@opencode-ai/ui/icon"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SettingsGeneralV2 } from "./general"
import { SettingsKeybinds } from "../settings-keybinds"
import { SettingsProvidersV2 } from "./providers"
import { SettingsModelsV2 } from "./models"
import "./settings-v2.css"
import { SettingsServersV2 } from "./servers"

type GloamMe = {
  authenticated: boolean
  firstName?: string
  username?: string
  email?: string
}

type DesktopApi = {
  gloamAuth?: { logout?: () => Promise<unknown>; me?: () => Promise<GloamMe> }
  relaunch?: () => void
}

const desktopApi = (): DesktopApi | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { api?: DesktopApi }).api

export const DialogSettings: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()

  const canLogout = () => !!desktopApi()?.gloamAuth?.logout

  // Load the signed-in account so the sidebar can show name + email like the web app.
  const [account] = createResource(async () => {
    const api = desktopApi()
    if (!api?.gloamAuth?.me) return null
    try {
      return await api.gloamAuth.me()
    } catch {
      return null
    }
  })

  const accountName = () => {
    const me = account()
    if (!me) return ""
    return me.firstName || me.username || me.email || ""
  }

  const accountInitial = () => {
    const name = accountName().trim()
    return name ? name[0].toUpperCase() : "?"
  }

  const handleLogout = async () => {
    try {
      await desktopApi()?.gloamAuth?.logout?.()
    } catch {
      // ignore logout failures and fall through to relaunch/reload
    }
    // A full relaunch restarts the sidecar so the cleared Gloam credential
    // actually takes effect; reload only as a fallback when relaunch is missing.
    const api = desktopApi()
    if (api?.relaunch) {
      api.relaunch()
      return
    }
    if (typeof window !== "undefined") window.location.reload()
  }

  return (
    <Dialog size="x-large" variant="settings" class="settings-v2-dialog">
      <TabsV2 orientation="vertical" variant="settings" defaultValue="general" class="settings-v2">
        <TabsV2.List>
          <div class="flex flex-col justify-between h-full w-full">
            <div class="flex flex-col gap-3 w-full">
              <div class="flex flex-col gap-3">
                <div class="flex flex-col gap-1.5">
                  <TabsV2.SectionTitle>{language.t("settings.section.desktop")}</TabsV2.SectionTitle>
                  <div class="flex flex-col gap-1.5 w-full">
                    <TabsV2.Trigger value="general">
                      <Icon name="sliders" />
                      {language.t("settings.tab.general")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="shortcuts">
                      <Icon name="keyboard" />
                      {language.t("settings.tab.shortcuts")}
                    </TabsV2.Trigger>
                  </div>
                </div>

                <div class="flex flex-col gap-1.5">
                  <TabsV2.SectionTitle>{language.t("settings.section.server")}</TabsV2.SectionTitle>
                  <div class="flex flex-col gap-1.5 w-full">
                    <TabsV2.Trigger value="servers">
                      <Icon name="server" />
                      {language.t("status.popover.tab.servers")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="providers">
                      <Icon name="providers" />
                      {language.t("settings.providers.title")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="models">
                      <Icon name="models" />
                      {language.t("settings.models.title")}
                    </TabsV2.Trigger>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <Show when={canLogout()}>
                <div class="flex items-center gap-2 px-1 py-1">
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/10 text-sm font-medium">
                    {accountInitial()}
                  </div>
                  <div class="flex flex-col min-w-0 flex-1 leading-tight">
                    <span class="text-sm font-medium truncate">
                      <Show when={accountName()} fallback={language.t("app.name.desktop")}>
                        {accountName()}
                      </Show>
                    </span>
                    <Show when={account()?.email}>
                      <span class="text-xs opacity-60 truncate">{account()?.email}</span>
                    </Show>
                  </div>
                  <ButtonV2 size="normal" variant="neutral" onClick={() => void handleLogout()}>
                    Выйти
                  </ButtonV2>
                </div>
              </Show>
              <div class="settings-v2-nav-footer">
                <span>{language.t("app.name.desktop")}</span>
                <span>v{platform.version}</span>
              </div>
            </div>
          </div>
        </TabsV2.List>
        <TabsV2.Content value="general" class="settings-v2-panel">
          <SettingsGeneralV2 />
        </TabsV2.Content>
        <TabsV2.Content value="shortcuts" class="settings-v2-panel">
          <SettingsKeybinds v2 />
        </TabsV2.Content>
        <TabsV2.Content value="servers" class="settings-v2-panel">
          <SettingsServersV2 />
        </TabsV2.Content>
        <TabsV2.Content value="providers" class="settings-v2-panel">
          <SettingsProvidersV2 />
        </TabsV2.Content>
        <TabsV2.Content value="models" class="settings-v2-panel">
          <SettingsModelsV2 />
        </TabsV2.Content>
      </TabsV2>
    </Dialog>
  )
}
