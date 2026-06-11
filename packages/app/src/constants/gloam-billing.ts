// Gloam billing / tariff configuration for the desktop Settings UI.
//
// Centralizes the external site URLs (tariffs, billing, auth) and the per-model
// quota cost multipliers (xN) so the Settings "Billing" and "Tariffs" tabs have
// a single source of truth. The multipliers mirror the gateway/admin model
// config; a model that is not listed costs 1x.

export const GLOAM_SITE_BASE = "https://bot-gloam-ai.vercel.app"

// Page that lists the tariffs and lets the user buy / renew (opens on the site).
export const GLOAM_TARIFFS_URL = `${GLOAM_SITE_BASE}/tariffs`

// Account / billing page: current plan, payment method, invoice history.
export const GLOAM_BILLING_URL = `${GLOAM_SITE_BASE}/account`

// Auth page to send unauthenticated users to before tariffs / billing.
export const GLOAM_AUTH_URL = `${GLOAM_SITE_BASE}/login`

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

// Opens an external URL in the system browser when running in the desktop
// shell, falling back to a normal new-window navigation in the browser.
export function openExternal(url: string): void {
  if (typeof window === "undefined") return
  const api = (window as unknown as { api?: { openExternal?: (u: string) => void } }).api
  if (api?.openExternal) {
    api.openExternal(url)
    return
  }
  window.open(url, "_blank", "noopener,noreferrer")
}
