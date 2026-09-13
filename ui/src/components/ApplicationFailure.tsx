import CheckIcon from "lucide-solid/icons/check";
import CopyIcon from "lucide-solid/icons/copy";
import { createSignal, Show } from "solid-js";

import { REVISION } from "../revision";
import styles from "./ApplicationFailure.module.css";

export interface ApplicationFailureProps {
  readonly error: unknown;
  readonly onRetry: () => void;
}

/** Presents an application-level failure that escaped a feature-specific error state. */
export function ApplicationFailure(props: ApplicationFailureProps) {
  const [copyStatus, setCopyStatus] = createSignal<"copied" | "failed">();
  const message = () => (props.error instanceof Error ? props.error.message : String(props.error));
  const stack = () => (props.error instanceof Error ? props.error.stack : undefined);
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(buildApplicationErrorReport(props.error));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };
  return (
    <main class={styles.page}>
      <section class={styles.failure} role="alert" aria-labelledby="application-failure-heading">
        <p class={styles.brand}>Joi</p>
        <h1 id="application-failure-heading">The application could not be loaded</h1>
        <p class={styles.message}>{message()}</p>
        <Show when={stack()}>
          {(trace) => (
            <details class={styles.stackTrace}>
              <summary>Stack trace</summary>
              <pre>{trace()}</pre>
            </details>
          )}
        </Show>
        <div class={styles.actions}>
          <button type="button" onClick={props.onRetry}>
            Retry
          </button>
          <button type="button" onClick={() => void copyReport()}>
            <Show when={copyStatus() === "copied"} fallback={<CopyIcon size={14} aria-hidden="true" />}>
              <CheckIcon size={14} aria-hidden="true" />
            </Show>
            Copy details
          </button>
          <span class={styles.copyStatus} aria-live="polite">
            {copyStatus() === "copied" ? "Copied" : copyStatus() === "failed" ? "Copy failed" : ""}
          </span>
        </div>
      </section>
    </main>
  );
}

/** Creates a portable diagnostic report for an application-level failure. */
export function buildApplicationErrorReport(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
  const scale = window.devicePixelRatio || 1;
  const lines = [
    "Joi application error",
    "",
    `Error: ${message}`,
    ...(stack ? ["", "Stack trace:", stack] : []),
    ...(REVISION ? ["", `Application revision: ${REVISION}`] : []),
    `User agent: ${navigator.userAgent}`,
    `OS/platform: ${platform || navigator.platform || "Unknown"}`,
    `Viewport: ${window.innerWidth} x ${window.innerHeight} CSS px`,
    `Screen: ${window.screen.width} x ${window.screen.height} CSS px`,
    `Screen estimate: ${Math.round(window.screen.width * scale)} x ${Math.round(window.screen.height * scale)} physical px`,
    `DPI scaling: ${scale}x`,
  ];
  return lines.join("\n");
}
