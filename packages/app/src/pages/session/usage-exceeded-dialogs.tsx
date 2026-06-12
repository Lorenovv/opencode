import { useSDK } from "@/context/sdk"
import { Persist, persisted } from "@/utils/persist"
import { SessionStatus } from "@opencode-ai/sdk/v2"
import { createResource, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useSessionLayout } from "./session-layout"
import { useDialog } from "@opencode-ai/ui/context"
import { DialogUsageExceeded } from "@/components/dialog-usage-exceeded"
import { useI18n } from "@opencode-ai/ui/context"

const GO_UPSELL_FREE_TIER_LAST_SEEN_AT = "go_upsell_last_seen_at"
const GO_UPSELL_FREE_TIER_DONT_SHOW = "go_upsell_dont_show"
const GO_UPSELL_ACCOUNT_RATE_LIMIT_LAST_SEEN_AT = "go_upsell_account_rate_limit_last_seen_at"
const GO_UPSELL_ACCOUNT_RATE_LIMIT_DONT_SHOW = "go_upsell_account_rate_limit_dont_show"
const GO_UPSELL_WINDOW = 86_400_000 // 24 hrs
const GO_UPSELL_PROVIDERS = new Set(["opencode", "opencode-go"])

// --- Gloam Desktop gate -----------------------------------------------------
// Free/Pro accounts are blocked server-side (HTTP 402) from using the managed
// Gloam provider; only the paid "Gloam Desktop" tariff unlocks it. When such a
// user sends a prompt the gateway rejects it and opencode retries, so we reuse
// the same session.status "retry" signal to surface a Desktop upsell dialog
// instead of leaving them with a cryptic "All providers failed" error. A
// non-Desktop account has no other provider connected (the provider/model tabs
// are hidden for them), so any retry here is necessarily the gateway 402.
const DESKTOP_REQUIRED_LAST_SEEN_AT = "desktop_required_last_seen_at"
const DESKTOP_REQUIRED_DONT_SHOW = "desktop_required_dont_show"
const DESKTOP_REQUIRED_WINDOW = 86_400_000 // 24 hrs
const DESKTOP_MANAGE_FALLBACK_URL = "https://bot-gloam-ai.vercel.app"

type GloamDesktopStatus = {
  authenticated: boolean
  plan?: string
  desktop?: { active: boolean; mode: "full" | "auto"; manageUrl?: string }
}

type DesktopApi = {
  gloamAuth?: { desktopStatus?: () => Promise<GloamDesktopStatus> }
}

const desktopApi = (): DesktopApi | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { api?: DesktopApi }).api

function goUpsellKeys(status: SessionStatus) {
  if (status.type !== "retry" || !status.action) return
  const { action } = status
  if (!GO_UPSELL_PROVIDERS.has(action.provider)) return
  if (action.reason === "free_tier_limit") {
    return {
      lastSeenAt: GO_UPSELL_FREE_TIER_LAST_SEEN_AT,
      dontShow: GO_UPSELL_FREE_TIER_DONT_SHOW,
    } as const
  }
  if (action.reason === "account_rate_limit") {
    return {
      lastSeenAt: GO_UPSELL_ACCOUNT_RATE_LIMIT_LAST_SEEN_AT,
      dontShow: GO_UPSELL_ACCOUNT_RATE_LIMIT_DONT_SHOW,
    } as const
  }
}

export function useUsageExceededDialogs() {
  const sdk = useSDK()
  const dialog = useDialog()
  const { params } = useSessionLayout()
  const { t, locale } = useI18n()
  const isEnglish = () => locale() === "en"

  const [goUpsellState, setGoUpsellState] = persisted(
    Persist.global("go-upsell"),
    createStore({
      [GO_UPSELL_FREE_TIER_LAST_SEEN_AT]: null as null | number,
      [GO_UPSELL_FREE_TIER_DONT_SHOW]: null as null | number,
      [GO_UPSELL_ACCOUNT_RATE_LIMIT_LAST_SEEN_AT]: null as null | number,
      [GO_UPSELL_ACCOUNT_RATE_LIMIT_DONT_SHOW]: null as null | number,
    }),
  )

  const [desktopUpsellState, setDesktopUpsellState] = persisted(
    Persist.global("desktop-upsell"),
    createStore({
      [DESKTOP_REQUIRED_LAST_SEEN_AT]: null as null | number,
      [DESKTOP_REQUIRED_DONT_SHOW]: null as null | number,
    }),
  )

  // Desktop-tier entitlement. On the web build there is no desktop bridge, so
  // this stays null and the gate below never applies.
  const [entitlement] = createResource(async () => {
    const api = desktopApi()
    if (!api?.gloamAuth?.desktopStatus) return null
    try {
      return await api.gloamAuth.desktopStatus()
    } catch {
      return null
    }
  })

  // True only when we positively know this is a signed-in, non-Desktop account
  // on the desktop build — exactly the case the gateway blocks with 402.
  const desktopGateApplies = () => {
    const api = desktopApi()
    if (!api?.gloamAuth?.desktopStatus) return false
    const status = entitlement()
    if (!status || !status.authenticated) return false
    return status.desktop?.active !== true
  }

  const showDesktopRequired = () => {
    const seen = desktopUpsellState[DESKTOP_REQUIRED_LAST_SEEN_AT]
    if (seen && Date.now() - seen < DESKTOP_REQUIRED_WINDOW) return
    if (desktopUpsellState[DESKTOP_REQUIRED_DONT_SHOW]) return
    const manageUrl = entitlement()?.desktop?.manageUrl || DESKTOP_MANAGE_FALLBACK_URL
    dialog.show(() => (
      <DialogUsageExceeded
        title="Нужен тариф Gloam Desktop"
        description="Доступ к нейросети в Gloam Desktop открыт только по подписке Gloam Desktop. На тарифах Free и Pro доступен лишь режим Auto без выбора моделей. Оформите подписку, чтобы продолжить."
        actionLabel="Оформить подписку"
        dismissLabel="Не показывать снова"
        link={manageUrl}
        onClose={(dontShowAgain) => {
          setDesktopUpsellState(DESKTOP_REQUIRED_LAST_SEEN_AT, Date.now())
          if (dontShowAgain) setDesktopUpsellState(DESKTOP_REQUIRED_DONT_SHOW, Date.now())
        }}
      />
    ))
  }

  onCleanup(
    sdk.event.on("session.status", (evt) => {
      if (evt.properties.sessionID !== params.id) return
      if (evt.properties.status.type !== "retry") return
      if (dialog.active) return

      // The Gloam Desktop gate takes precedence: a signed-in non-Desktop account
      // can only be retrying because the gateway 402-blocked the managed Gloam
      // provider, so show the Desktop upsell instead of the opencode-go upsell.
      if (desktopGateApplies()) {
        showDesktopRequired()
        return
      }

      const { action } = evt.properties.status
      if (!action) return

      const keys = goUpsellKeys(evt.properties.status)
      if (!keys) return

      const seen = goUpsellState[keys.lastSeenAt]
      if (seen && Date.now() - seen < GO_UPSELL_WINDOW) return
      if (goUpsellState[keys.dontShow]) return

      if (action.reason === "free_tier_limit") {
        dialog.show(() => (
          <DialogUsageExceeded
            title={isEnglish() ? action.title : t("dialog.usageExceeded.freeTier.title")}
            description={isEnglish() ? action.message : t("dialog.usageExceeded.freeTier.description")}
            actionLabel={isEnglish() ? action.label : t("dialog.usageExceeded.freeTier.actionLabel")}
            link={action.link}
            onClose={(dontShowAgain) => {
              setGoUpsellState(keys.lastSeenAt, Date.now())
              if (dontShowAgain) setGoUpsellState(keys.dontShow, Date.now())
              else {
                void import("../../components/dialog-connect-provider").then((x) =>
                  dialog.show(() => <x.DialogConnectProvider provider="opencode-go" />),
                )
              }
            }}
          />
        ))
      } else if (action.reason === "account_rate_limit") {
        dialog.show(() => (
          <DialogUsageExceeded
            title={isEnglish() ? action.title : t("dialog.usageExceeded.accountRateLimit.title")}
            description={isEnglish() ? action.message : t("dialog.usageExceeded.accountRateLimit.description")}
            actionLabel={isEnglish() ? action.label : t("dialog.usageExceeded.accountRateLimit.actionLabel")}
            link={action.link}
            onClose={(dontShowAgain) => {
              setGoUpsellState(keys.lastSeenAt, Date.now())
              if (dontShowAgain) setGoUpsellState(keys.dontShow, Date.now())
            }}
          />
        ))
      }
    }),
  )
}
