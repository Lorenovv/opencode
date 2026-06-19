import { Component, Show, createResource, createSignal } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import "./settings-v2.css"

type GloamGithubStatus = {
  connected: boolean
}

type DesktopApi = {
  gloamGithub?: {
    status?: () => Promise<GloamGithubStatus>
    setToken?: (token: string) => Promise<GloamGithubStatus>
    clear?: () => Promise<GloamGithubStatus>
  }
  relaunch?: () => void
}

const desktopApi = (): DesktopApi | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { api?: DesktopApi }).api

export const SettingsConnectionsV2: Component = () => {
  const [token, setTokenValue] = createSignal("")
  const [busy, setBusy] = createSignal(false)

  // Connection state is owned by the main process (the encrypted token never
  // reaches the renderer); we only read whether something is stored.
  const [status, { refetch }] = createResource(async () => {
    const api = desktopApi()
    if (!api?.gloamGithub?.status) return { connected: false } as GloamGithubStatus
    try {
      return await api.gloamGithub.status()
    } catch {
      return { connected: false } as GloamGithubStatus
    }
  })

  const connected = () => status()?.connected === true

  // Applying or clearing the token only takes effect after the sidecar restarts,
  // so we relaunch the app once the main process has persisted the change.
  const relaunchSoon = () => {
    const api = desktopApi()
    if (api?.relaunch) api.relaunch()
  }

  const handleSave = async () => {
    if (busy()) return
    const value = token().trim()
    if (!value) return
    const api = desktopApi()
    if (!api?.gloamGithub?.setToken) {
      showToast({
        variant: "error",
        title: "Недоступно",
        description: "Подключение GitHub работает только в десктоп-приложении Gloam.",
      })
      return
    }
    setBusy(true)
    try {
      await api.gloamGithub.setToken(value)
      setTokenValue("")
      await refetch()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: "GitHub подключён",
        description: "Перезапускаем приложение, чтобы агент получил доступ к вашим репозиториям.",
      })
      relaunchSoon()
    } catch (error) {
      showToast({
        variant: "error",
        title: "Не удалось сохранить токен",
        description: error instanceof Error ? error.message : "Неизвестная ошибка.",
      })
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    if (busy()) return
    const api = desktopApi()
    if (!api?.gloamGithub?.clear) return
    setBusy(true)
    try {
      await api.gloamGithub.clear()
      setTokenValue("")
      await refetch()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: "GitHub отключён",
        description: "Перезапускаем приложение, чтобы убрать доступ агента к репозиториям.",
      })
      relaunchSoon()
    } catch (error) {
      showToast({
        variant: "error",
        title: "Не удалось отключить",
        description: error instanceof Error ? error.message : "Неизвестная ошибка.",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="settings-v2-tab">
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">Подключения</h2>
      </div>
      <div class="settings-v2-tab-body">
        <SettingsListV2>
          <div class="settings-v2-section">
            <div class="settings-v2-section-title">GitHub</div>
            <div class="settings-v2-provider-row">
              <div class="settings-v2-provider-lead">
                <div class="settings-v2-provider-copy">
                  <div class="settings-v2-provider-main">
                    <span class="settings-v2-provider-name">GitHub</span>
                    <Tag>{connected() ? "Подключено" : "Не подключено"}</Tag>
                  </div>
                  <span class="settings-v2-provider-description">
                    Подключите GitHub через персональный токен (fine-grained PAT), чтобы агент мог напрямую работать с
                    вашими репозиториями: читать код, создавать ветки и коммиты, заводить issues и pull request'ы.
                  </span>
                </div>
              </div>
            </div>

            <div class="settings-v2-provider-row">
              <div class="settings-v2-provider-lead">
                <div class="settings-v2-provider-copy">
                  <span class="settings-v2-provider-name">Персональный токен</span>
                  <span class="settings-v2-provider-description">
                    Создайте fine-grained токен: github.com → Settings → Developer settings → Personal access tokens →
                    Fine-grained tokens, и выдайте доступ к нужным репозиториям. Токен хранится в зашифрованном виде на
                    вашем компьютере и не передаётся на серверы Gloam.
                  </span>
                  <TextInputV2
                    type="password"
                    appearance="base"
                    autocomplete="off"
                    placeholder={connected() ? "Введите новый токен, чтобы заменить" : "github_pat_..."}
                    value={token()}
                    onInput={(event) => setTokenValue((event.currentTarget as HTMLInputElement).value)}
                  />
                </div>
              </div>
            </div>

            <div class="settings-v2-provider-row">
              <div class="settings-v2-provider-lead">
                <div class="settings-v2-provider-copy">
                  <div class="settings-v2-provider-main">
                    <ButtonV2 size="normal" variant="neutral" icon="plus" onClick={() => void handleSave()}>
                      {connected() ? "Обновить токен" : "Подключить"}
                    </ButtonV2>
                    <Show when={connected()}>
                      <ButtonV2 size="normal" variant="ghost-muted" onClick={() => void handleDisconnect()}>
                        Отключить
                      </ButtonV2>
                    </Show>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SettingsListV2>
      </div>
    </div>
  )
}
