import { type ComponentProps } from "solid-js"

const LOGO_FONT =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      class={props.class}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="8"
        y="16"
        text-anchor="middle"
        font-family={LOGO_FONT}
        font-size="18"
        font-weight="700"
        letter-spacing="-1"
        fill="var(--icon-strong-base)"
      >G</text>
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      class={props.class}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="40"
        y="74"
        text-anchor="middle"
        font-family={LOGO_FONT}
        font-size="84"
        font-weight="700"
        letter-spacing="-2"
        fill="var(--icon-strong-base)"
      >G</text>
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      class={props.class}
    >
      <text
        x="117"
        y="34"
        text-anchor="middle"
        font-family={LOGO_FONT}
        font-size="38"
        font-weight="700"
        letter-spacing="-1.5"
        fill="var(--icon-strong-base)"
      >Gloam</text>
    </svg>
  )
}
