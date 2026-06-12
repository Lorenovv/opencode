import { type Component, Show, createResource } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

// Where "Управление планом" sends users to upgrade / manage billing when the
// backend doesn't supply an explicit manage URL.
const MANAGE_PLAN_FALLBACK_URL = "https://bot-gloam-ai.vercel.app"

type DesktopInfo = {
  active: boolean
  mode: "full" | "auto"
  until?: string | null
  price?: number
  currency?: string
  manageUrl?: string
}

type DesktopStatus = {
  authenticated: boolean
  plan?: string
  desktop?: DesktopInfo
  account?: Record<string, unknown>
}

type DesktopApi = {
  gloamAuth?: { desktopStatus?: () => Promise<DesktopStatus> }
  openLink?: (url: string) => void
}

const desktopApi = (): DesktopApi | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { api?: DesktopApi }).api

export const SettingsLimitsV2: Component = () => {
  const [status] = createResource(async () => {
    const api = desktopApi()
    if (!api?.gloamAuth?.desktopStatus) return null
    try {
      return await api.gloamAuth.desktopStatus()
    } catch {
      return null
    }
  })

  const account = (): Record<string, unknown> => status()?.account ?? {}
  const num = (key: string): number | undefined => {
    const value = account()[key]
    return typeof value === "number" ? value : undefined
  }

  const planLabel = (): string => {
    if (status()?.desktop?.active) return "Gloam Desktop"
    const plan = status()?.plan
    if (plan === "pro") return "Pro"
    return "Free"
  }

  const quotaUsed = () => num("quota_used")
  const quotaLimit = () => num("quota_limit")

  const renewsOn = (): string | null => {
    const until = status()?.desktop?.until
    if (!until) return null
    const parsed = new Date(until)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toLocaleDateString("ru-RU")
  }

  const manageUrl = (): string => status()?.desktop?.manageUrl || MANAGE_PLAN_FALLBACK_URL

  const openManage = () => {
    const url = manageUrl()
    const api = desktopApi()
    if (api?.openLink) {
      api.openLink(url)
      return
    }
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener")
  }

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">Лимиты</h2>
      </div>
      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">Тариф</h3>
          <SettingsListV2>
            <SettingsRowV2 title="Текущий тариф" description="Ваш активный тариф Gloam Desktop">
              <Tag>{planLabel()}</Tag>
            </SettingsRowV2>
            <Show when={renewsOn()}>
              <SettingsRowV2 title="Продление" description="Дата следующего списания">
                <span>{renewsOn()}</span>
              </SettingsRowV2>
            </Show>
          </SettingsListV2>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">Использование</h3>
          <SettingsListV2>
            <Show
              when={quotaLimit() !== undefined}
              fallback={
                <SettingsRowV2 title="Квота запросов" description="Использовано из общего лимита за период">
                  <span>Недоступно</span>
                </SettingsRowV2>
              }
            >
              <SettingsRowV2 title="Квота запросов" description="Использовано из общего лимита за период">
                <span>
                  {quotaUsed() ?? 0} / {quotaLimit()}
                </span>
              </SettingsRowV2>
            </Show>
          </SettingsListV2>
        </div>

        <div>
          <ButtonV2 size="normal" variant="neutral" onClick={openManage}>
            Управление планом
          </ButtonV2>
        </div>
      </div>
    </>
  )
}
