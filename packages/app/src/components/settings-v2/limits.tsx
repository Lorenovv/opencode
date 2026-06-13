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

// Coding-credit pool usage from the gateway (the pool that actually meters
// coding requests, separate from the bot chat quota in DesktopStatus.account).
type DesktopUsage = {
  authenticated: boolean
  used?: number
  limit?: number
  windowStart?: string | null
  resetsAt?: string | null
}

type DesktopApi = {
  gloamAuth?: {
    desktopStatus?: () => Promise<DesktopStatus>
    desktopUsage?: () => Promise<DesktopUsage>
  }
  openLink?: (url: string) => void
}

const desktopApi = (): DesktopApi | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { api?: DesktopApi }).api

// Russian plural for "день" (1 день, 2 дня, 5 дней).
const pluralDays = (n: number): string => {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return "дней"
  if (mod10 === 1) return "день"
  if (mod10 >= 2 && mod10 <= 4) return "дня"
  return "дней"
}

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

  const [usage] = createResource(async () => {
    const api = desktopApi()
    if (!api?.gloamAuth?.desktopUsage) return null
    try {
      return await api.gloamAuth.desktopUsage()
    } catch {
      return null
    }
  })

  const planLabel = (): string => {
    if (status()?.desktop?.active) return "Gloam Desktop"
    const plan = status()?.plan
    if (plan === "pro") return "Pro"
    return "Free"
  }

  // Coding pool (gateway). This is what meters coding requests.
  const poolUsed = (): number | undefined => {
    const value = usage()?.used
    return typeof value === "number" ? value : undefined
  }
  const poolLimit = (): number | undefined => {
    const value = usage()?.limit
    return typeof value === "number" && value > 0 ? value : undefined
  }

  // Days remaining until the rolling window refills. resetsAt is null when no
  // window is active yet (full budget) -> no countdown to show.
  const daysUntilReset = (): number | null => {
    const at = usage()?.resetsAt
    if (!at) return null
    const parsed = new Date(at)
    if (Number.isNaN(parsed.getTime())) return null
    const ms = parsed.getTime() - Date.now()
    if (ms <= 0) return 0
    return Math.ceil(ms / 86_400_000)
  }

  const resetLabel = (): string => {
    const days = daysUntilReset()
    if (days === null) return "Квота полная"
    if (days === 0) return "Сегодня"
    return `${days} ${pluralDays(days)}`
  }

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
          <h3 class="settings-v2-section-title">Квота кодинга</h3>
          <SettingsListV2>
            <Show
              when={poolLimit() !== undefined}
              fallback={
                <SettingsRowV2 title="Использовано баллов" description="Израсходовано из лимита за текущий период">
                  <span>Недоступно</span>
                </SettingsRowV2>
              }
            >
              <SettingsRowV2 title="Использовано баллов" description="Израсходовано из лимита за текущий период">
                <span>
                  {poolUsed() ?? 0} / {poolLimit()}
                </span>
              </SettingsRowV2>
            </Show>
            <SettingsRowV2 title="До сброса квоты" description="Сколько дней осталось до обновления квоты">
              <span>{resetLabel()}</span>
            </SettingsRowV2>
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
