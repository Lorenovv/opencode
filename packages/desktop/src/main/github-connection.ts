import { safeStorage } from "electron"

import { getStore } from "./store"
import { GLOAM_GITHUB_PAT_KEY, GLOAM_GITHUB_STORE } from "./store-keys"

// GitHub's remote MCP server (HTTP). We authenticate with a personal access
// token via the Authorization header (PAT-only; no OAuth/DCR which this server
// does not support).
export const GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/"

// Environment variable the sidecar opencode config references via {env:...}, so
// the raw token is never written to the opencode config file on disk.
export const GITHUB_PAT_ENV = "GLOAM_GITHUB_PAT"

function store() {
  return getStore(GLOAM_GITHUB_STORE)
}

// Persist the PAT encrypted at rest. safeStorage uses the OS keychain / DPAPI
// when available; we refuse to store anything if encryption is unavailable
// rather than fall back to plaintext.
export function setToken(token: string) {
  const trimmed = token.trim()
  if (!trimmed) {
    clearToken()
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS secure storage is unavailable; refusing to store the GitHub token in plaintext.")
  }
  const cipher = safeStorage.encryptString(trimmed).toString("base64")
  store().set(GLOAM_GITHUB_PAT_KEY, cipher)
}

export function clearToken() {
  store().delete(GLOAM_GITHUB_PAT_KEY)
}

export function hasToken(): boolean {
  const value = store().get(GLOAM_GITHUB_PAT_KEY)
  return typeof value === "string" && value.length > 0
}

// Decrypt the stored PAT for injection into the sidecar environment. Returns
// null when missing or when decryption fails (e.g. the OS keychain rotated).
export function getDecryptedToken(): string | null {
  const value = store().get(GLOAM_GITHUB_PAT_KEY)
  if (typeof value !== "string" || !value) return null
  try {
    return safeStorage.decryptString(Buffer.from(value, "base64"))
  } catch {
    return null
  }
}
