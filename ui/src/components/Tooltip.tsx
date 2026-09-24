import { Portal } from "solid-js/web";
import { createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";
import styles from "./Tooltip.module.css";

export interface TooltipProps {
  children: JSX.Element;
  /** Called only while the tooltip is visible. */
  content: () => JSX.Element;
  /** Delay before opening, in milliseconds. Defaults to 500. */
  delay?: number;
}

export function Tooltip(props: TooltipProps) {
  let anchor!: HTMLSpanElement;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const [visible, setVisible] = createSignal(false);

  const hide = () => {
    clearTimeout(timer);
    timer = undefined;
    setVisible(false);
  };
  const show = () => {
    if (visible() || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      setVisible(true);
    }, props.delay ?? 500);
  };
  onCleanup(hide);

  return (
    <span
      ref={anchor}
      class={styles.anchor}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusIn={show}
      onFocusOut={(event) => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) hide();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") hide();
      }}
    >
      {props.children}
      <Show when={visible()}>
        <TooltipContent anchor={anchor} content={props.content} />
      </Show>
    </span>
  );
}

function TooltipContent(props: { anchor: HTMLElement; content: () => JSX.Element }) {
  let element!: HTMLDivElement;
  const [position, setPosition] = createSignal({ left: 0, top: 0, ready: false });

  const place = () => {
    const anchor = props.anchor.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - bounds.width - margin));
    const below = anchor.bottom + gap;
    const above = anchor.top - bounds.height - gap;
    const top = below + bounds.height <= window.innerHeight - margin ? below : above;
    setPosition({
      left,
      top: Math.max(margin, Math.min(top, window.innerHeight - bounds.height - margin)),
      ready: true,
    });
  };

  onMount(() => {
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
  });
  onCleanup(() => {
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
  });

  return (
    <Portal>
      <div
        ref={element}
        role="tooltip"
        class={styles.tooltip}
        style={{
          left: `${position().left}px`,
          top: `${position().top}px`,
          visibility: position().ready ? "visible" : "hidden",
        }}
      >
        {props.content()}
      </div>
    </Portal>
  );
}
