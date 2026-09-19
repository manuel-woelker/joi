import type { ComponentProps } from "solid-js";
import { createEffect, createSignal, onCleanup, onMount, Show, splitProps, untrack } from "solid-js";
import styles from "./DateTime.module.css";
import { formatRelativeTime } from "./relative-time";

export interface DateTimeProps extends ComponentProps<"time"> {
  readonly value: string | Date | number;
}

/** Formats a date as `2026-09-19 16:40:44` in the user's local timezone. */
export function formatAbsoluteDateTime(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

/** Displays a human relative time, adding the absolute local timestamp when there is room for it. */
export function DateTime(props: DateTimeProps) {
  const [local, rest] = splitProps(props, ["class", "value"]);
  const date = () => {
    const v = local.value;
    return v instanceof Date ? v : typeof v === "string" ? new Date(v) : new Date(v);
  };
  const relative = () => formatRelativeTime(date());
  const absolute = () => formatAbsoluteDateTime(date());
  const iso = () => date().toISOString();

  // The absolute timestamp is only worth showing when it fits: render both
  // parts, then collapse the absolute part while it overflows. Widths
  // measured while visible are cached so the absolute part can return once
  // the parent grows again.
  const [showAbsolute, setShowAbsolute] = createSignal(true);
  let host: HTMLTimeElement | undefined;
  let relativePart: HTMLSpanElement | undefined;
  let absolutePart: HTMLSpanElement | undefined;
  let absoluteWidth = 0;

  const update = () => {
    const hostElement = host;
    const relativeElement = relativePart;
    const parent = hostElement?.parentElement;
    if (!hostElement || !relativeElement || !parent) return;
    if (!showAbsolute()) {
      const gap = Number.parseFloat(getComputedStyle(hostElement).gap) || 0;
      if (parent.clientWidth < relativeElement.offsetWidth + absoluteWidth + gap) return;
      setShowAbsolute(true);
    }
    const measured = absolutePart?.offsetWidth;
    if (measured) absoluteWidth = measured;
    if (hostElement.scrollWidth > hostElement.clientWidth + 1) setShowAbsolute(false);
  };

  onMount(() => {
    update();
    const parent = host?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => update());
    observer.observe(parent);
    onCleanup(() => observer.disconnect());
  });
  createEffect(() => {
    date();
    untrack(update);
  });

  return (
    <time {...rest} ref={host} class={`${styles.datetime} ${local.class ?? ""}`} datetime={iso()} title={absolute()}>
      <span ref={relativePart} class={styles.relative}>
        {relative()}
      </span>
      <Show when={showAbsolute()}>
        <span ref={absolutePart} class={styles.absolute}>
          {absolute()}
        </span>
      </Show>
    </time>
  );
}
