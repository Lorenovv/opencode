export const SETTINGS_STORE = "opencode.settings"
export const DEFAULT_SERVER_URL_KEY = "defaultServerUrl"
export const WSL_SERVERS_KEY = "wslServers"
export const PINCH_ZOOM_ENABLED_KEY = "pinchZoomEnabled"

// Gloam Desktop account session (separate from the website cookie session).
// Stored in its own electron-store file so it never collides with app settings.
export const GLOAM_AUTH_STORE = "gloam.auth"
export const GLOAM_SESSION_TOKEN_KEY = "sessionToken"
export const GLOAM_SESSION_EXPIRES_KEY = "sessionExpiresAtUnix"

// GitHub MCP connection. The personal access token is stored encrypted (via
// Electron safeStorage) in its own electron-store file, never in plaintext and
// never alongside app settings.
export const GLOAM_GITHUB_STORE = "gloam.github"
export const GLOAM_GITHUB_PAT_KEY = "patCipher"
