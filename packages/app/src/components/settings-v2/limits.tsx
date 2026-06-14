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

// Daily token quota from the gateway. The gateway meters every token (prompt +
// completion, multiplied by the model coefficient) against a per-day budget
// that resets at midnight Moscow time. `used` / `limit` are token counts and
// `resetsAt` is the next midnight reset instant.
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

// Russian plural for "час" (1 час, 2 часа, 5 часов).
const pluralHours = (n: number): string => {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return "часов"
  if (mod10 === 1) return "час"
  if (mod10 >= 2 && mod10 <= 4) return "часа"
  return "часов"
}

// Russian plural for "минута" (1 минута, 2 минуты, 5 минут).
const pluralMinutes = (n: number): string => {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return "минут"
  if (mod10 === 1) return "минута"
  if (mod10 >= 2 && mod10 <= 4) return "минуты"
  return "минут"
}

// Group large token counts with thin spaces (1 000 000) for readability.
const fmtTokens = (n: number): string => n.toLocaleString("ru-RU")

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

  // Daily token pool (gateway). This is what meters every request.
  const poolUsed = (): number | undefined => {
    const value = usage()?.used
    return typeof value === "number" ? value : undefined
  }
  const poolLimit = (): number | undefined => {
    const value = usage()?.limit
    return typeof value === "number" && value > 0 ? value : undefined
  }

  // Milliseconds remaining until the daily quota resets at midnight Moscow.
  // resetsAt is null only when the gateway can't supply a reset instant.
  const msUntilReset = (): number | null => {
    const at = usage()?.resetsAt
    if (!at) return null
    const parsed = new Date(at)
    if (Number.isNaN(parsed.getTime())) return null
    const ms = parsed.getTime() - Date.now()
    return ms <= 0 ? 0 : ms
  }

  const resetLabel = (): string => {
    const ms = msUntilReset()
    if (ms === null) return "В полночь по Москве"
    if (ms === 0) return "Обновляется…"
    const totalMinutes = Math.ceil(ms / 60_000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours > 0 && minutes > 0) {
      return `через ${hours} ${pluralHours(hours)} ${minutes} ${pluralMinutes(minutes)}`
    }
    if (hours > 0) return `через ${hours} ${pluralHours(hours)}`
    return `через ${minutes} ${pluralMinutes(minutes)}`
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
          <h3 class="settings-v2-section-title">Дневная квота токенов</h3>
          <SettingsListV2>
            <Show
              when={poolLimit() !== undefined}
              fallback={
                <SettingsRowV2 title="Токенов за сегодня" description="Израсходовано из дневного лимита токенов">
                  <span>Недоступно</span>
                </SettingsRowV2>
              }
            >
              <SettingsRowV2 title="Токенов за сегодня" description="Израсходовано из дневного лимита токенов">
                <span>
                  {fmtTokens(poolUsed() ?? 0)} / {fmtTokens(poolLimit() as number)}
                </span>
              </SettingsRowV2>
            </Show>
            <SettingsRowV2 title="До сброса лимита" description="Лимит обновляется каждый день в полночь по московскому времени">
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
