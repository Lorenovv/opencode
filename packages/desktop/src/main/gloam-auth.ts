import { app, net, shell } from "electron"
import { randomBytes } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import type {
	GloamAuthConfig,
	GloamDesktopStatus,
	GloamDesktopUsage,
	GloamLoginRequest,
	GloamMe,
	GloamSession,
} from "../preload/types"
import { write as writeLog } from "./logging"
import { getStore } from "./store"
import {
	GLOAM_AUTH_STORE,
	GLOAM_SESSION_EXPIRES_KEY,
	GLOAM_SESSION_TOKEN_KEY,
} from "./store-keys"

// The desktop app talks to the same Gloam backend as the website, but it is a
// completely separate session: we always send `X-Gloam-Client: desktop`, get a
// bearer token in the response body (never a cookie), and store it locally.
const DEFAULT_API_BASE = "https://bot-gloam-ai.vercel.app/api"
const DESKTOP_CLIENT_HEADER = "desktop"

// The managed Gloam provider is registered against the gateway origin as its
// providerID inside the sidecar's auth store (auth.json). On logout we must
// remove that credential from disk, otherwise the freshly-restarted sidecar
// re-reads it and silently reconnects the provider with the stale token.
const GLOAM_GATEWAY_PROVIDER_ID = "https://gateway.gloam.site"

// Origin of the Gloam gateway (the OpenAI-compatible proxy). The coding-credit
// pool lives here, not on the bot backend, so the Limits tab reads usage from
// the gateway. Overridable for local/staging via GLOAM_GATEWAY_URL.
const DEFAULT_GATEWAY_BASE = "https://gateway.gloam.site"

function apiBase(): string {
	const raw = (process.env.GLOAM_API_BASE_URL ?? "").trim()
	return (raw || DEFAULT_API_BASE).replace(/\/+$/, "")
}

function gatewayBase(): string {
	const raw = (process.env.GLOAM_GATEWAY_URL ?? "").trim()
	return (raw || DEFAULT_GATEWAY_BASE).replace(/\/+$/, "")
}

type AuthResponseBody = {
	ok?: boolean
	tg_id?: number
	token?: string
	expires_at?: string
	expires_at_unix?: number
	detail?: unknown
}

function describeDetail(detail: unknown, status: number): string {
	if (typeof detail === "string" && detail.trim()) return detail
	if (detail && typeof detail === "object") {
		const reason = (detail as Record<string, unknown>).reason
		if (typeof reason === "string" && reason.trim()) return reason
		const message = (detail as Record<string, unknown>).message
		if (typeof message === "string" && message.trim()) return message
	}
	return `HTTP ${status}`
}

async function readBody(res: Response): Promise<AuthResponseBody> {
	const text = await res.text()
	if (!text) return {}
	try {
		return JSON.parse(text) as AuthResponseBody
	} catch {
		return {}
	}
}

function storeSession(token: string, expiresAtUnix: number): void {
	const store = getStore(GLOAM_AUTH_STORE)
	store.set(GLOAM_SESSION_TOKEN_KEY, token)
	store.set(GLOAM_SESSION_EXPIRES_KEY, expiresAtUnix)
}

export function getStoredToken(): string | null {
	const store = getStore(GLOAM_AUTH_STORE)
	const token = store.get(GLOAM_SESSION_TOKEN_KEY)
	if (typeof token !== "string" || !token) return null
	const expires = store.get(GLOAM_SESSION_EXPIRES_KEY)
	if (typeof expires === "number" && expires > 0 && expires * 1000 <= Date.now()) {
		return null
	}
	return token
}

export function clearSession(): void {
	const store = getStore(GLOAM_AUTH_STORE)
	store.delete(GLOAM_SESSION_TOKEN_KEY)
	store.delete(GLOAM_SESSION_EXPIRES_KEY)
}

// Path to the embedded opencode server's credential store. The sidecar pins
// XDG_DATA_HOME to <userData>/data (see sidecar.ts), and opencode keeps its
// auth file at <XDG_DATA_HOME>/opencode/auth.json.
function sidecarAuthPath(): string {
	return join(app.getPath("userData"), "data", "opencode", "auth.json")
}

// Remove the managed Gloam provider credential from the sidecar's auth.json.
// Best-effort: the file may not exist yet, may be empty, or may hold unrelated
// custom-provider keys (which we must preserve), so we only drop the Gloam
// entry instead of deleting the whole file.
export function clearSidecarGloamCredential(): void {
	const authPath = sidecarAuthPath()
	let parsed: Record<string, unknown>
	try {
		parsed = JSON.parse(readFileSync(authPath, "utf8")) as Record<string, unknown>
	} catch {
		// No readable auth store -> nothing to clear.
		return
	}
	if (!parsed || typeof parsed !== "object" || !(GLOAM_GATEWAY_PROVIDER_ID in parsed)) {
		return
	}
	delete parsed[GLOAM_GATEWAY_PROVIDER_ID]
	try {
		writeFileSync(authPath, JSON.stringify(parsed, null, 2))
	} catch (error) {
		writeLog("gloam-auth", "failed to clear sidecar credential", { error: String(error) }, "warn")
	}
}

// Full desktop logout: drop the stored session token and the sidecar's managed
// provider credential. The caller is responsible for relaunching the app so the
// sidecar restarts without the Gloam provider.
export function logout(): void {
	clearSession()
	clearSidecarGloamCredential()
}

function endpointFor(req: GloamLoginRequest): {
	path: string
	body: Record<string, unknown>
} {
	switch (req.method) {
		case "email-login":
			return { path: "/auth/login", body: { email: req.email, password: req.password } }
		case "email-register":
			return {
				path: "/auth/register",
				body: {
					email: req.email,
					password: req.password,
					first_name: req.firstName ?? "",
				},
			}
		case "google":
			return { path: "/auth/google", body: { credential: req.credential } }
		case "telegram":
			return { path: "/auth/telegram", body: req.payload }
	}
}

export async function login(req: GloamLoginRequest): Promise<GloamSession> {
	const { path, body } = endpointFor(req)
	const res = await net.fetch(`${apiBase()}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Gloam-Client": DESKTOP_CLIENT_HEADER,
		},
		body: JSON.stringify(body),
	})
	const parsed = await readBody(res)
	if (!res.ok) {
		throw new Error(describeDetail(parsed.detail, res.status))
	}
	if (!parsed.token || typeof parsed.expires_at_unix !== "number") {
		throw new Error(
			"Сервер не вернул токен десктоп-сессии. Обновите бэкенд (PR #148).",
		)
	}
	storeSession(parsed.token, parsed.expires_at_unix)
	return {
		ok: true,
		tgId: parsed.tg_id ?? 0,
		token: parsed.token,
		expiresAtUnix: parsed.expires_at_unix,
	}
}

export async function me(): Promise<GloamMe> {
	const token = getStoredToken()
	if (!token) return { authenticated: false }
	try {
		const res = await net.fetch(`${apiBase()}/auth/me`, {
			method: "GET",
			headers: {
				"X-Gloam-Client": DESKTOP_CLIENT_HEADER,
				Authorization: `Bearer ${token}`,
			},
		})
		if (res.status === 401 || res.status === 403) {
			clearSession()
			return { authenticated: false }
		}
		if (!res.ok) {
			writeLog("gloam-auth", "me() returned non-ok status", { status: res.status }, "warn")
			return { authenticated: false }
		}
		const data = (await res.json()) as Record<string, unknown>
		return {
			authenticated: true,
			tgId: typeof data.tg_id === "number" ? data.tg_id : undefined,
			firstName: typeof data.first_name === "string" ? data.first_name : undefined,
			username: typeof data.username === "string" ? data.username : undefined,
			email: typeof data.email === "string" ? data.email : undefined,
			authProvider:
				typeof data.auth_provider === "string" ? data.auth_provider : undefined,
			status:
				data.status && typeof data.status === "object"
					? (data.status as Record<string, unknown>)
					: undefined,
		}
	} catch (error) {
		writeLog("gloam-auth", "me() request failed", { error: String(error) }, "error")
		return { authenticated: false }
	}
}

// Desktop-tier entitlement + quota snapshot. Backed by GET /desktop/status,
// which returns the user's plan, the desktop subscription block, and the same
// account status payload as /auth/me. The renderer uses `desktop.active` /
// `desktop.mode` to decide whether to unlock provider + model selection or pin
// the user to managed "auto" mode.
export async function desktopStatus(): Promise<GloamDesktopStatus> {
	const token = getStoredToken()
	if (!token) return { authenticated: false }
	try {
		const res = await net.fetch(`${apiBase()}/desktop/status`, {
			method: "GET",
			headers: {
				"X-Gloam-Client": DESKTOP_CLIENT_HEADER,
				Authorization: `Bearer ${token}`,
			},
		})
		if (res.status === 401 || res.status === 403) {
			clearSession()
			return { authenticated: false }
		}
		if (!res.ok) {
			writeLog("gloam-auth", "desktopStatus() returned non-ok status", { status: res.status }, "warn")
			return { authenticated: false }
		}
		const data = (await res.json()) as Record<string, unknown>
		const desktopRaw =
			data.desktop && typeof data.desktop === "object"
				? (data.desktop as Record<string, unknown>)
				: undefined
		const desktop = desktopRaw
			? {
					active: desktopRaw.active === true,
					mode: desktopRaw.mode === "full" ? ("full" as const) : ("auto" as const),
					until: typeof desktopRaw.until === "string" ? desktopRaw.until : null,
					price: typeof desktopRaw.price === "number" ? desktopRaw.price : undefined,
					currency:
						typeof desktopRaw.currency === "string" ? desktopRaw.currency : undefined,
					manageUrl:
						typeof desktopRaw.manage_url === "string" ? desktopRaw.manage_url : undefined,
				}
			: undefined
		return {
			authenticated: true,
			tgId: typeof data.tg_id === "number" ? data.tg_id : undefined,
			plan: typeof data.plan === "string" ? data.plan : undefined,
			desktop,
			account:
				data.account && typeof data.account === "object"
					? (data.account as Record<string, unknown>)
					: undefined,
		}
	} catch (error) {
		writeLog("gloam-auth", "desktopStatus() request failed", { error: String(error) }, "error")
		return { authenticated: false }
	}
}

// Coding-credit pool usage for the Limits tab. Backed by the gateway's
// GET /v1/desktop/usage (authenticated with the same session token). Returns
// used/limit points and the rolling-window reset time. Non-fatal: any failure
// just yields { authenticated: false } and the UI shows "Недоступно". We do
// NOT clear the session on 401 here (status()/me() own session lifecycle).
export async function desktopUsage(): Promise<GloamDesktopUsage> {
	const token = getStoredToken()
	if (!token) return { authenticated: false }
	try {
		const res = await net.fetch(`${gatewayBase()}/v1/desktop/usage`, {
			method: "GET",
			headers: {
				"X-Gloam-Client": DESKTOP_CLIENT_HEADER,
				Authorization: `Bearer ${token}`,
			},
		})
		if (!res.ok) {
			if (res.status !== 401 && res.status !== 403) {
				writeLog("gloam-auth", "desktopUsage() returned non-ok status", { status: res.status }, "warn")
			}
			return { authenticated: false }
		}
		const data = (await res.json()) as Record<string, unknown>
		return {
			authenticated: true,
			used: typeof data.used === "number" ? data.used : 0,
			limit: typeof data.limit === "number" ? data.limit : 0,
			windowStart: typeof data.window_start === "string" ? data.window_start : null,
			resetsAt: typeof data.resets_at === "string" ? data.resets_at : null,
		}
	} catch (error) {
		writeLog("gloam-auth", "desktopUsage() request failed", { error: String(error) }, "error")
		return { authenticated: false }
	}
}

export async function config(): Promise<GloamAuthConfig> {
	try {
		const res = await net.fetch(`${apiBase()}/auth/config`, {
			method: "GET",
			headers: { "X-Gloam-Client": DESKTOP_CLIENT_HEADER },
		})
		if (!res.ok) return {}
		return (await res.json()) as GloamAuthConfig
	} catch (error) {
		writeLog("gloam-auth", "config() request failed", { error: String(error) }, "error")
		return {}
	}
}

// ---------------------------------------------------------------------------
// Browser-based login flows (Google redirect + Telegram bot deep link)
// ---------------------------------------------------------------------------
//
// Unlike the synchronous flows in `login()` (POST a payload, get a token back),
// these two bounce the user out to the system browser and bring the session
// back through a different channel:
//
//   * Google: opens the desktop google start endpoint, which redirects to
//     Google's consent screen and finally to the desktop google callback.
//     That callback renders an interstitial that location.replace-s to
//     opencode://auth/callback?provider=google&token=...&expires_at_unix=...
//     The OS hands that deep link to the app; the renderer forwards it to
//     applyDeepLinkSession().
//
//   * Telegram: opens the bot start link for ?start=desktop_<state>. The bot
//     resolves the account and stashes it against <state>; the renderer then
//     polls pollTelegramExchange(state) which claims the session via the
//     existing /auth/telegram/exchange endpoint. (Telegram won't linkify a
//     custom opencode:// scheme, so there is no deep link for this flow.)

const DEEP_LINK_AUTH_ROUTE = "auth/callback"
const TELEGRAM_LINK_BASE = "https://t.me/"
// Native Telegram scheme. Preferred over the https t.me link because, for a bot
// that has already been started (always true for returning users), the https
// link tends to just focus the existing chat and silently drop the ?start
// payload — so the bot receives a bare /start and replies with the generic
// greeting instead of completing the desktop login. tg://resolve delivers the
// start parameter to the installed client reliably.
const TELEGRAM_NATIVE_BASE = "tg://resolve?domain="

export function googleStartUrl(): string {
	return `${apiBase()}/auth/desktop/google/start`
}

export async function startGoogleLogin(): Promise<string> {
	const url = googleStartUrl()
	await shell.openExternal(url)
	return url
}

export async function startTelegramLogin(): Promise<{ url: string; state: string }> {
	const cfg = await config()
	const rawUsername =
		(typeof cfg.bot_username === "string" && cfg.bot_username) ||
		(typeof cfg.telegramBotUsername === "string" && cfg.telegramBotUsername) ||
		""
	const username = rawUsername.replace(/^@/, "").trim()
	if (!username) {
		throw new Error(
			"Не настроен Telegram-бот: сервер не вернул bot_username. Обратитесь к администратору.",
		)
	}
	const state = randomBytes(18).toString("base64url")
	const startParam = "desktop_" + state
	const encodedUsername = encodeURIComponent(username)
	const nativeUrl = TELEGRAM_NATIVE_BASE + encodedUsername + "&start=" + startParam
	const webUrl = TELEGRAM_LINK_BASE + encodedUsername + "?start=" + startParam
	// Try the native client first; only fall back to the https link (Telegram
	// Web / install page) when there is no handler for the tg:// scheme.
	try {
		await shell.openExternal(nativeUrl)
		return { url: nativeUrl, state }
	} catch (error) {
		writeLog(
			"gloam-auth",
			"tg:// open failed, falling back to https t.me link",
			{ error: String(error) },
			"warn",
		)
		await shell.openExternal(webUrl)
		return { url: webUrl, state }
	}
}

export async function pollTelegramExchange(state: string): Promise<GloamSession | null> {
	if (!state) return null
	let res: Response
	try {
		res = await net.fetch(`${apiBase()}/auth/telegram/exchange`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Gloam-Client": DESKTOP_CLIENT_HEADER,
			},
			body: JSON.stringify({ state }),
		})
	} catch (error) {
		writeLog("gloam-auth", "telegram exchange poll failed", { error: String(error) }, "warn")
		return null
	}
	// The session isn't ready until the user has actually tapped the bot link.
	// The exchange endpoint signals "not yet" with a 4xx (typically 404); we
	// treat any client error as "keep polling" and only surface 5xx as fatal.
	if (res.status >= 500) {
		const parsed = await readBody(res)
		throw new Error(describeDetail(parsed.detail, res.status))
	}
	if (!res.ok) return null
	const parsed = await readBody(res)
	if (!parsed.token || typeof parsed.expires_at_unix !== "number") return null
	storeSession(parsed.token, parsed.expires_at_unix)
	return {
		ok: true,
		tgId: parsed.tg_id ?? 0,
		token: parsed.token,
		expiresAtUnix: parsed.expires_at_unix,
	}
}

export function applyDeepLinkSession(rawUrl: string): GloamSession | null {
	let parsed: URL
	try {
		parsed = new URL(rawUrl)
	} catch {
		return null
	}
	if (parsed.protocol !== "opencode:") return null
	const route = `${parsed.host}${parsed.pathname}`.replace(/^\/+|\/+$/g, "")
	if (route !== DEEP_LINK_AUTH_ROUTE) return null
	const error = parsed.searchParams.get("error")
	if (error) {
		throw new Error(error)
	}
	const token = parsed.searchParams.get("token")
	const expiresRaw = parsed.searchParams.get("expires_at_unix")
	const expires = expiresRaw ? Number(expiresRaw) : Number.NaN
	if (!token || !Number.isFinite(expires)) return null
	storeSession(token, expires)
	return { ok: true, tgId: 0, token, expiresAtUnix: expires }
}
