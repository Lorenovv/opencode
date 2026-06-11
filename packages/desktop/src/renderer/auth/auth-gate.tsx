import { Splash } from "@opencode-ai/ui/logo"
import { createResource, createSignal, onCleanup, Show, type JSX } from "solid-js"
import type { GloamLoginRequest } from "../../preload/types"

type Mode = "login" | "register"

// Hover / focus / cursor styling lives in real CSS (injected once below) rather
// than inline styles: inline styles cannot express :hover and would also win
// over Tailwind utilities, so the buttons previously only reacted to clicks.
const LOGIN_CSS = `
.gl-field {
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  background: transparent;
  color: inherit;
  transition: border-color .15s ease, background-color .15s ease;
}
.gl-field::placeholder { color: color-mix(in srgb, currentColor 45%, transparent); }
.gl-field:hover:not(:disabled) { border-color: color-mix(in srgb, currentColor 34%, transparent); }
.gl-field:focus { border-color: color-mix(in srgb, currentColor 55%, transparent); }

.gl-btn {
  cursor: pointer;
  border: 1px solid transparent;
  transition: filter .15s ease, background-color .15s ease, border-color .15s ease, box-shadow .15s ease, transform .04s ease;
  -webkit-user-select: none;
  user-select: none;
}
.gl-btn:disabled { cursor: default; opacity: .55; }

.gl-btn-primary {
  color: #fff;
  background: #7c5cff;
}
.gl-btn-primary:hover:not(:disabled) {
  background: #8b6dff;
  box-shadow: 0 8px 22px -8px rgba(124, 92, 246, .6);
}
.gl-btn-primary:active:not(:disabled) { transform: translateY(1px); background: #6f50f0; }

.gl-btn-oauth {
  color: inherit;
  background: color-mix(in srgb, currentColor 7%, transparent);
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
}
.gl-btn-oauth:hover:not(:disabled) {
  background: color-mix(in srgb, currentColor 15%, transparent);
  border-color: color-mix(in srgb, currentColor 30%, transparent);
}
.gl-btn-oauth:active:not(:disabled) { transform: translateY(1px); }

.gl-link { cursor: pointer; transition: opacity .15s ease; }
.gl-link:hover { opacity: 1; }
`

function SplashScreen() {
  return (
    <div class="h-dvh w-screen flex flex-col items-center justify-center bg-background-base">
      <Splash class="w-16 h-20 opacity-50 animate-pulse" />
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" class="shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="#29a9eb" class="shrink-0">
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
  )
}

const dividerStyle: JSX.CSSProperties = {
  background: "currentColor",
}

const errorStyle: JSX.CSSProperties = {
  color: "#f87171",
}

function LoginScreen(props: { onAuthenticated: () => void }) {
  const [mode, setMode] = createSignal<Mode>("login")
  const [email, setEmail] = createSignal("")
  const [password, setPassword] = createSignal("")
  const [firstName, setFirstName] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const [config] = createResource(() => window.api.gloamAuth.config())
  const googleEnabled = () => config()?.google_redirect_enabled === true
  const telegramEnabled = () => {
    const cfg = config()
    const raw = cfg?.bot_username ?? cfg?.telegramBotUsername
    return typeof raw === "string" && raw.trim().length > 0
  }

  const isRegister = () => mode() === "register"

  // The component may unmount mid-flow (e.g. once authenticated); guard the
  // Telegram polling loop so it stops instead of calling onAuthenticated twice.
  let cancelled = false
  onCleanup(() => {
    cancelled = true
  })

  // Google bounces the session back through an opencode:// deep link rather than
  // a direct response, so we listen for it here and finish the login.
  const handleDeepLinks = async (urls: string[]) => {
    for (const url of urls) {
      try {
        const session = await window.api.gloamAuth.applyDeepLink(url)
        if (session) {
          props.onAuthenticated()
          return
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
  }
  const unsubscribe = window.api.onDeepLink((urls) => void handleDeepLinks(urls))
  onCleanup(unsubscribe)

  const submit = async (event: Event) => {
    event.preventDefault()
    if (busy()) return
    setError(null)

    const mail = email().trim()
    if (!mail || !password()) {
      setError("Введите email и пароль")
      return
    }

    const request: GloamLoginRequest = isRegister()
      ? { method: "email-register", email: mail, password: password(), firstName: firstName().trim() || undefined }
      : { method: "email-login", email: mail, password: password() }

    setBusy(true)
    try {
      await window.api.gloamAuth.login(request)
      props.onAuthenticated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const loginViaGoogle = async () => {
    if (busy()) return
    setError(null)
    try {
      await window.api.gloamAuth.startGoogle()
      // The session arrives via the deep-link listener above.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const loginViaTelegram = async () => {
    if (busy()) return
    setError(null)
    setBusy(true)
    try {
      const { state } = await window.api.gloamAuth.startTelegram()
      const deadline = Date.now() + 3 * 60 * 1000
      while (!cancelled && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2500))
        if (cancelled) return
        const session = await window.api.gloamAuth.pollTelegram(state)
        if (session) {
          props.onAuthenticated()
          return
        }
      }
      if (!cancelled) {
        setError("Не удалось подтвердить вход через Telegram. Попробуйте ещё раз.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="h-dvh w-screen flex flex-col items-center justify-center bg-background-base px-6">
      <style>{LOGIN_CSS}</style>
      <form class="w-full max-w-sm flex flex-col gap-5" onSubmit={submit}>
        <div class="flex flex-col items-center gap-3">
          <Splash class="w-12 h-14 opacity-90" />
          <div class="text-center">
            <div class="text-lg font-semibold">Gloam Desktop</div>
            <div class="text-sm opacity-60">
              {isRegister() ? "Создайте аккаунт Gloam" : "Войдите в аккаунт Gloam"}
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <Show when={isRegister()}>
            <input
              class="gl-field w-full rounded-md px-3 py-2 text-sm outline-none"
              type="text"
              autocomplete="name"
              placeholder="Имя (необязательно)"
              value={firstName()}
              onInput={(e) => setFirstName(e.currentTarget.value)}
              disabled={busy()}
            />
          </Show>
          <input
            class="gl-field w-full rounded-md px-3 py-2 text-sm outline-none"
            type="email"
            autocomplete="email"
            placeholder="Email"
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
            disabled={busy()}
          />
          <input
            class="gl-field w-full rounded-md px-3 py-2 text-sm outline-none"
            type="password"
            autocomplete={isRegister() ? "new-password" : "current-password"}
            placeholder="Пароль"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            disabled={busy()}
          />
        </div>

        <Show when={error()}>
          <div class="text-sm" style={errorStyle}>
            {error()}
          </div>
        </Show>

        <button
          type="submit"
          class="gl-btn gl-btn-primary w-full rounded-md px-3 py-2 text-sm font-semibold"
          disabled={busy()}
        >
          {busy() ? "…" : isRegister() ? "Зарегистрироваться" : "Войти"}
        </button>

        <Show when={googleEnabled() || telegramEnabled()}>
          <div class="flex items-center gap-3 opacity-50">
            <div class="h-px flex-1" style={dividerStyle} />
            <span class="text-xs">или</span>
            <div class="h-px flex-1" style={dividerStyle} />
          </div>
          <div class="flex flex-col gap-3">
            <Show when={googleEnabled()}>
              <button
                type="button"
                class="gl-btn gl-btn-oauth w-full rounded-md px-3 py-2 text-sm font-medium flex items-center justify-center gap-2"
                disabled={busy()}
                onClick={() => void loginViaGoogle()}
              >
                <GoogleIcon />
                <span>Войти через Google</span>
              </button>
            </Show>
            <Show when={telegramEnabled()}>
              <button
                type="button"
                class="gl-btn gl-btn-oauth w-full rounded-md px-3 py-2 text-sm font-medium flex items-center justify-center gap-2"
                disabled={busy()}
                onClick={() => void loginViaTelegram()}
              >
                <TelegramIcon />
                <span>Войти через Telegram</span>
              </button>
            </Show>
          </div>
        </Show>

        <div class="text-center text-sm opacity-70">
          <Show
            when={isRegister()}
            fallback={
              <button type="button" class="gl-link underline" onClick={() => { setError(null); setMode("register") }}>
                Нет аккаунта? Зарегистрироваться
              </button>
            }
          >
            <button type="button" class="gl-link underline" onClick={() => { setError(null); setMode("login") }}>
              Уже есть аккаунт? Войти
            </button>
          </Show>
        </div>
      </form>
    </div>
  )
}

/**
 * Gates the desktop app behind a Gloam account. While the session is being
 * checked we show the splash; if there is no valid session we show the login
 * screen; only once authenticated do we mount the actual app (children).
 */
export function AuthGate(props: { children: JSX.Element }) {
  const [auth, { refetch }] = createResource(() => window.api.gloamAuth.me())

  return (
    <Show when={!auth.loading} fallback={<SplashScreen />}>
      <Show when={auth()?.authenticated} fallback={<LoginScreen onAuthenticated={() => void refetch()} />}>
        {props.children}
      </Show>
    </Show>
  )
}
