import type { DesktopMenuAction } from "@opencode-ai/app/desktop-menu"
import type { WslServersPlatform } from "@opencode-ai/app/wsl/types"
import type { UpdaterState } from "@opencode-ai/app/updater"
export type {
  WslDistroProbe,
  WslInstalledDistro,
  WslJob,
  WslOnlineDistro,
  WslOpencodeCheck,
  WslRuntimeCheck,
  WslServerConfig,
  WslServerItem,
  WslServerRuntime,
  WslServersEvent,
  WslServersState,
} from "@opencode-ai/app/wsl/types"

export type ServerReadyData = {
  url: string
  username: string | null
  password: string | null
}

export type WslServersAPI = WslServersPlatform
export type UpdaterAPI = {
  subscribe: (cb: (state: UpdaterState) => void) => Promise<() => void>
  check: () => Promise<UpdaterState>
  install: () => Promise<void>
}

export type LinuxDisplayBackend = "wayland" | "auto"
export type TitlebarTheme = {
  mode: "light" | "dark"
}
export type FatalRendererError = {
  error: string
  url: string
  version?: string
  platform: string
  os?: string
}

// Gloam account auth. This is a SEPARATE session from the website cookie
// session: the desktop app always authenticates with a bearer token issued by
// the backend for `X-Gloam-Client: desktop` requests.
export type GloamLoginRequest =
  | { method: "email-login"; email: string; password: string }
  | { method: "email-register"; email: string; password: string; firstName?: string }
  | { method: "google"; credential: string }
  | { method: "telegram"; payload: Record<string, unknown> }

export type GloamSession = {
  ok: true
  tgId: number
  token: string
  expiresAtUnix: number
}

export type GloamMe = {
  authenticated: boolean
  tgId?: number
  firstName?: string
  username?: string
  email?: string
  authProvider?: string
  status?: Record<string, unknown>
}

// The backend /auth/config endpoint returns snake_case keys. We keep the older
// camelCase aliases too so nothing that referenced them breaks, but new code
// should read the snake_case fields.
export type GloamAuthConfig = {
  googleClientId?: string
  telegramBotUsername?: string
  emailVerificationRequired?: boolean
  bot_username?: string
  google_client_id?: string
  google_login_enabled?: boolean
  google_redirect_enabled?: boolean
  email_verification_required?: boolean
  [key: string]: unknown
}

export type GloamAuthAPI = {
  config: () => Promise<GloamAuthConfig>
  login: (req: GloamLoginRequest) => Promise<GloamSession>
  me: () => Promise<GloamMe>
  logout: () => Promise<void>
  hasToken: () => Promise<boolean>
  getToken: () => Promise<string | null>
  // Opens the system browser at the desktop Google start endpoint; the session
  // returns via an opencode:// deep link handled by applyDeepLink.
  startGoogle: () => Promise<string>
  // Opens t.me/<bot>?start=desktop_<state> and returns the state to poll.
  startTelegram: () => Promise<{ url: string; state: string }>
  // One poll attempt against /auth/telegram/exchange; null while pending.
  pollTelegram: (state: string) => Promise<GloamSession | null>
  // Parses an opencode://auth/callback deep link and stores the session.
  applyDeepLink: (url: string) => Promise<GloamSession | null>
}

export type ElectronAPI = {
  killSidecar: () => Promise<void>
  installCli: () => Promise<string>
  awaitInitialization: () => Promise<ServerReadyData>
  wslServers: WslServersAPI
  updater: UpdaterAPI
  gloamAuth: GloamAuthAPI
  consumeInitialDeepLinks: () => Promise<string[]>
  getDefaultServerUrl: () => Promise<string | null>
  setDefaultServerUrl: (url: string | null) => Promise<void>
  getDisplayBackend: () => Promise<LinuxDisplayBackend | null>
  setDisplayBackend: (backend: LinuxDisplayBackend | null) => Promise<void>
  parseMarkdownCommand: (markdown: string) => Promise<string>
  checkAppExists: (appName: string) => Promise<boolean>
  resolveAppPath: (appName: string) => Promise<string | null>
  storeGet: (name: string, key: string) => Promise<string | null>
  storeSet: (name: string, key: string, value: string) => Promise<void>
  storeDelete: (name: string, key: string) => Promise<void>
  storeClear: (name: string) => Promise<void>
  storeKeys: (name: string) => Promise<string[]>
  storeLength: (name: string) => Promise<number>

  getWindowCount: () => Promise<number>
  onMenuCommand: (cb: (id: string) => void) => () => void
  onDeepLink: (cb: (urls: string[]) => void) => () => void

  openDirectoryPicker: (opts?: {
    multiple?: boolean
    title?: string
    defaultPath?: string
  }) => Promise<string | string[] | null>
  openFilePicker: (opts?: {
    multiple?: boolean
    title?: string
    defaultPath?: string
    extensions?: string[]
  }) => Promise<{ token: string; files: { path: string; name: string; size: number }[] } | null>
  readPickedFile: (token: string, path: string) => Promise<ArrayBuffer>
  releasePickedFiles: (token: string) => Promise<void>
  saveFilePicker: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>
  openLink: (url: string) => void
  openPath: (path: string, app?: string) => Promise<void>
  readClipboardImage: () => Promise<{ buffer: ArrayBuffer; width: number; height: number } | null>
  showNotification: (title: string, body?: string) => void
  getWindowFocused: () => Promise<boolean>
  setWindowFocus: () => Promise<void>
  showWindow: () => Promise<void>
  relaunch: () => void
  getZoomFactor: () => Promise<number>
  setZoomFactor: (factor: number) => Promise<void>
  getPinchZoomEnabled: () => Promise<boolean>
  setPinchZoomEnabled: (enabled: boolean) => Promise<void>
  onPinchZoomEnabledChanged: (cb: (enabled: boolean) => void) => () => void
  onZoomFactorChanged: (cb: (factor: number) => void) => () => void
  setTitlebar: (theme: TitlebarTheme) => Promise<void>
  runDesktopMenuAction: (action: DesktopMenuAction) => Promise<void>
  setBackgroundColor: (color: string) => Promise<void>
  exportDebugLogs: () => Promise<string>
  recordFatalRendererError: (error: FatalRendererError) => Promise<void>
}
