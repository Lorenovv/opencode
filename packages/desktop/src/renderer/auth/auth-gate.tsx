import { Splash } from "@opencode-ai/ui/logo"
import { createResource, createSignal, Show, type JSX } from "solid-js"
import type { GloamLoginRequest } from "../../preload/types"

type Mode = "login" | "register"

function SplashScreen() {
  return (
    <div class="h-dvh w-screen flex flex-col items-center justify-center bg-background-base">
      <Splash class="w-16 h-20 opacity-50 animate-pulse" />
    </div>
  )
}

const fieldStyle: JSX.CSSProperties = {
  border: "1px solid color-mix(in srgb, currentColor 22%, transparent)",
  background: "transparent",
  color: "inherit",
}

const primaryButtonStyle: JSX.CSSProperties = {
  border: "1px solid color-mix(in srgb, currentColor 30%, transparent)",
  background: "color-mix(in srgb, currentColor 12%, transparent)",
  color: "inherit",
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

  const isRegister = () => mode() === "register"

  const submit = async (event: Event) => {
    event.preventDefault()
    if (busy()) return
    setError(null)

    const mail = email().trim()
    if (!mail || !password()) {
      setError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 email \u0438 \u043f\u0430\u0440\u043e\u043b\u044c")
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

  return (
    <div class="h-dvh w-screen flex flex-col items-center justify-center bg-background-base px-6">
      <form class="w-full max-w-sm flex flex-col gap-5" onSubmit={submit}>
        <div class="flex flex-col items-center gap-3">
          <Splash class="w-12 h-14 opacity-90" />
          <div class="text-center">
            <div class="text-lg font-semibold">Gloam Desktop</div>
            <div class="text-sm opacity-60">
              {isRegister()
                ? "\u0421\u043e\u0437\u0434\u0430\u0439\u0442\u0435 \u0430\u043a\u043a\u0430\u0443\u043d\u0442 Gloam"
                : "\u0412\u043e\u0439\u0434\u0438\u0442\u0435 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442 Gloam"}
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <Show when={isRegister()}>
            <input
              class="w-full rounded-md px-3 py-2 text-sm outline-none"
              style={fieldStyle}
              type="text"
              autocomplete="name"
              placeholder={"\u0418\u043c\u044f (\u043d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e)"}
              value={firstName()}
              onInput={(e) => setFirstName(e.currentTarget.value)}
              disabled={busy()}
            />
          </Show>
          <input
            class="w-full rounded-md px-3 py-2 text-sm outline-none"
            style={fieldStyle}
            type="email"
            autocomplete="email"
            placeholder="Email"
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
            disabled={busy()}
          />
          <input
            class="w-full rounded-md px-3 py-2 text-sm outline-none"
            style={fieldStyle}
            type="password"
            autocomplete={isRegister() ? "new-password" : "current-password"}
            placeholder={"\u041f\u0430\u0440\u043e\u043b\u044c"}
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
          class="w-full rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
          style={primaryButtonStyle}
          disabled={busy()}
        >
          {busy()
            ? "\u2026"
            : isRegister()
              ? "\u0417\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c\u0441\u044f"
              : "\u0412\u043e\u0439\u0442\u0438"}
        </button>

        <div class="text-center text-sm opacity-70">
          <Show
            when={isRegister()}
            fallback={
              <button type="button" class="underline" onClick={() => { setError(null); setMode("register") }}>
                {"\u041d\u0435\u0442 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430? \u0417\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c\u0441\u044f"}
              </button>
            }
          >
            <button type="button" class="underline" onClick={() => { setError(null); setMode("login") }}>
              {"\u0423\u0436\u0435 \u0435\u0441\u0442\u044c \u0430\u043a\u043a\u0430\u0443\u043d\u0442? \u0412\u043e\u0439\u0442\u0438"}
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
