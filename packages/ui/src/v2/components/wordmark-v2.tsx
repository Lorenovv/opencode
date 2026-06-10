import { type ComponentProps } from "solid-js"

export function WordmarkV2(props: Pick<ComponentProps<"svg">, "class">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720 129"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      class={props.class}
    >
      <text
        x="360"
        y="100"
        text-anchor="middle"
        font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        font-size="118"
        font-weight="800"
        letter-spacing="4"
        fill="currentColor"
      >GLOAM</text>
    </svg>
  )
}
