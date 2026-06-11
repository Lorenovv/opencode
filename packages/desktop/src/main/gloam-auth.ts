import { net } from "electron"

import type {
	GloamAuthConfig,
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

function apiBase(): string {
	const raw = (process.env.GLOAM_API_BASE_URL ?? "").trim()
	return (raw || DEFAULT_API_BASE).replace(/\/+$/, "")
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
			"\u0421\u0435\u0440\u0432\u0435\u0440 \u043d\u0435 \u0432\u0435\u0440\u043d\u0443\u043b \u0442\u043e\u043a\u0435\u043d \u0434\u0435\u0441\u043a\u0442\u043e\u043f-\u0441\u0435\u0441\u0441\u0438\u0438. \u041e\u0431\u043d\u043e\u0432\u0438\u0442\u0435 \u0431\u044d\u043a\u0435\u043d\u0434 (PR #148).",
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
