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
  const dailyRemaining = () => num("daily_remaining")
  const dailyLimit = () => num("daily_limit")

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
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-1.5">
        <h2 class="text-lg font-semibold">Лимиты</h2>
        <p class="text-sm opacity-60">Тариф, квота и управление подпиской Gloam Desktop.</p>
      </div>

      <div class="flex flex-col gap-2">
        <h3 class="text-sm font-medium opacity-70">Тариф</h3>
        <SettingsListV2>
          <SettingsRowV2 title="Текущий тариф" description="Ваш активный тариф Gloam Desktop">
            <Tag>{planLabel()}</Tag>
          </SettingsRowV2>
          <Show when={renewsOn()}>
            <SettingsRowV2 title="Продление" description="">
              <span>{renewsOn()}</span>
            </SettingsRowV2>
          </Show>
        </SettingsListV2>
      </div>

      <div class="flex flex-col gap-2">
        <h3 class="text-sm font-medium opacity-70">Использование</h3>
        <SettingsListV2>
          <Show
            when={quotaLimit() !== undefined || dailyLimit() !== undefined}
            fallback={
              <SettingsRowV2 title="Квота запросов" description="">
                <span>Недоступно</span>
              </SettingsRowV2>
            }
          >
            <Show when={quotaLimit() !== undefined}>
              <SettingsRowV2 title="Квота запросов" description="Использовано из общего лимита за период">
                <span>
                  {quotaUsed() ?? 0} / {quotaLimit()}
                </span>
              </SettingsRowV2>
            </Show>
            <Show when={dailyLimit() !== undefined}>
              <SettingsRowV2 title="Осталось за день" description="">
                <span>
                  {dailyRemaining() ?? 0} / {dailyLimit()}
                </span>
              </SettingsRowV2>
            </Show>
          </Show>
        </SettingsListV2>
      </div>

      <div>
        <ButtonV2 size="normal" variant="neutral" onClick={openManage}>
          Управление планом
        </ButtonV2>
      </div>
    </div>
  )
}
