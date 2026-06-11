// Gloam billing / tariff configuration for the desktop Settings UI.
//
// Single source of truth for:
//   * the external site URL (subscription / payment management), and
//   * the per-model quota cost multipliers (xN) shown in the limits view.
//
// The Gloam site is a single-page app (built for PWA / Telegram) with in-page
// tabs ("Chat" / "Subscription" / settings) rather than distinct routes, so all
// of the links below point at the site root. Subscription management and
// payment (cards / SBP / crypto) happen there; Pro auto-activates after a
// successful payment. In-app we only render the read-only plan + quota the
// backend already exposes through gloamAuth.me().status.

export const GLOAM_SITE_BASE = "https://bot-gloam-ai.vercel.app"

// Subscription / tariffs management lives under the site's "Subscription" tab.
export const GLOAM_TARIFFS_URL = GLOAM_SITE_BASE

// Billing (current plan, payment method, invoices) also lives on the site.
export const GLOAM_BILLING_URL = GLOAM_SITE_BASE

// Auth is handled by the site itself (Telegram / PWA), so just open the root.
export const GLOAM_AUTH_URL = GLOAM_SITE_BASE

// Per-model quota cost multipliers. Keys match the model id, optionally with a
// reasoning-effort variant suffix ("<modelID>-<variant>"). Lookup tries the
// variant-specific key first, then the bare model id, then defaults to 1.
export const GLOAM_MODEL_COST: Record<string, number> = {
  // Anthropic
  "claude-opus-4.8": 4,
  "claude-opus-4.7": 3,
  "claude-opus-4.6": 1,
  "claude-sonnet-4.6": 1,
  "claude-sonnet-4.5": 1,
  "claude-haiku-4.5": 1,
  // Google
  "gemini-3.5-flash-low": 2,
  "gemini-3.1-pro-low": 2,
  "gemini-3-flash": 1,
  "gemini-3.1-flash-lite": 1.5,
  "gemini-2.5-pro": 1,
  "gemini-2.5-flash": 1,
  "gemini-2.5-flash-lite": 1,
  "gemini-3-flash-preview": 1.5,
  // OpenAI
  "gpt-5.5-xhigh": 3,
  "gpt-5.5-high": 3,
  "gpt-5.4-xhigh": 3,
  "gpt-5.4-high": 2.5,
  "gpt-5.3-codex-xhigh": 2.5,
  "gpt-5.3-codex-high": 2.5,
}

export function gloamModelCost(modelID: string, variant?: string): number {
  if (variant) {
    const withVariant = GLOAM_MODEL_COST[`${modelID}-${variant}`]
    if (typeof withVariant === "number") return withVariant
  }
  const base = GLOAM_MODEL_COST[modelID]
  return typeof base === "number" ? base : 1
}

// ---------------------------------------------------------------------------
// Window bridge helpers (renderer side)
// ---------------------------------------------------------------------------

type GloamMeResult = {
  authenticated: boolean
  status?: Record<string, unknown>
  firstName?: string
  username?: string
  email?: string
}

type GloamWindowApi = {
  openLink?: (url: string) => void
  gloamAuth?: { me?: () => Promise<GloamMeResult> }
}

function gloamWindowApi(): GloamWindowApi | undefined {
  if (typeof window === "undefined") return undefined
  return (window as unknown as { api?: GloamWindowApi }).api
}

// Opens an external URL in the system browser via the desktop bridge
// (window.api.openLink), falling back to a normal new-window navigation when
// running outside the desktop shell.
export function openExternal(url: string): void {
  const api = gloamWindowApi()
  if (api?.openLink) {
    api.openLink(url)
    return
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer")
  }
}

export type GloamPlan = "free" | "pro"

// Normalised subset of the backend status_payload we care about in Settings.
export type GloamStatus = {
  plan: GloamPlan
  proUntil: string | null
  quotaUsed: number
  quotaLimit: number
  quotaRemaining: number
  quotaResetsAt: string | null
  isTrial: boolean
  unlimited: boolean
  hasActiveSubscription: boolean
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

// Maps the raw snake_case status_payload (from gloamAuth.me().status) into the
// camelCase GloamStatus the UI consumes. Returns null when there is no payload.
export function parseGloamStatus(raw: Record<string, unknown> | undefined): GloamStatus | null {
  if (!raw) return null
  const plan: GloamPlan = raw["plan"] === "pro" ? "pro" : "free"
  return {
    plan,
    proUntil: asString(raw["pro_until"]),
    quotaUsed: asNumber(raw["quota_used"]),
    quotaLimit: asNumber(raw["quota_limit"]),
    quotaRemaining: asNumber(raw["daily_remaining"]),
    quotaResetsAt: asString(raw["quota_resets_at"]),
    isTrial: raw["is_trial"] === true,
    unlimited: raw["unlimited"] === true,
    hasActiveSubscription: raw["has_active_subscription"] === true,
  }
}

// Loads the current plan + quota via the existing main-process me() bridge
// (which calls /auth/me with the desktop bearer token, so there is no CORS
// involved). Returns null when unauthenticated or the bridge is unavailable.
export async function fetchGloamStatus(): Promise<GloamStatus | null> {
  const api = gloamWindowApi()
  if (!api?.gloamAuth?.me) return null
  const me = await api.gloamAuth.me()
  if (!me || !me.authenticated) return null
  return parseGloamStatus(me.status)
}
