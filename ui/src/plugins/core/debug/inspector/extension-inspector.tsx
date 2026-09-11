import {
  createContext,
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  useContext,
  type Accessor,
  type JSX,
  type ParentProps,
} from "solid-js";
import { Portal } from "solid-js/web";

import { serviceKey } from "../../../../base/service-registry";
import styles from "./ExtensionInspector.module.css";

export type InspectorMarkerKind = "extension" | "extension-point";

export interface InspectorMarker {
  readonly key: symbol;
  readonly kind: InspectorMarkerKind;
  readonly id: string;
  readonly anchor: HTMLElement;
}

interface InspectorFrame extends InspectorMarker {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Coordinates extension-boundary registration and inspection visibility. */
export class ExtensionInspectorService {
  private readonly enabledState = createSignal(false);
  private readonly markerState = createSignal<readonly InspectorMarker[]>([]);

  readonly enabled: Accessor<boolean> = this.enabledState[0];
  readonly markers: Accessor<readonly InspectorMarker[]> = this.markerState[0];

  setEnabled(enabled: boolean): void {
    this.enabledState[1](enabled);
  }

  toggle(): void {
    this.enabledState[1]((enabled) => !enabled);
  }

  register(kind: InspectorMarkerKind, id: string, anchor: HTMLElement): () => void {
    const marker = { key: Symbol(id), kind, id, anchor } satisfies InspectorMarker;
    this.markerState[1]((markers) => [...markers, marker]);
    return () => this.markerState[1]((markers) => markers.filter((candidate) => candidate !== marker));
  }
}

export const extensionInspectorServiceKey = serviceKey<ExtensionInspectorService>("extension-inspector-service");

const ExtensionInspectorContext = createContext<ExtensionInspectorService>();

export function ExtensionInspectorProvider(props: ParentProps<{ service: ExtensionInspectorService }>): JSX.Element {
  return (
    <ExtensionInspectorContext.Provider value={props.service}>{props.children}</ExtensionInspectorContext.Provider>
  );
}

export function useExtensionInspector(): ExtensionInspectorService {
  const inspector = useContext(ExtensionInspectorContext);
  if (!inspector) throw new Error("ExtensionInspectorProvider is missing");
  return inspector;
}

export function InspectableExtension(props: ParentProps<{ id: string }>): JSX.Element {
  return (
    <InspectorMarker kind="extension" id={props.id}>
      {props.children}
    </InspectorMarker>
  );
}

export function InspectableExtensionPoint(props: ParentProps<{ id: string }>): JSX.Element {
  return (
    <InspectorMarker kind="extension-point" id={props.id}>
      {props.children}
    </InspectorMarker>
  );
}

function InspectorMarker(props: ParentProps<{ kind: InspectorMarkerKind; id: string }>): JSX.Element {
  const inspector = useExtensionInspector();
  let anchor!: HTMLSpanElement;
  onMount(() => onCleanup(inspector.register(props.kind, props.id, anchor)));
  return (
    <span ref={anchor} class={styles.anchor}>
      {props.children}
    </span>
  );
}

export function ExtensionInspectorOverlay(): JSX.Element {
  const inspector = useExtensionInspector();
  const [frames, setFrames] = createSignal<readonly InspectorFrame[]>([]);
  let animationFrame: number | undefined;

  const measure = () => {
    animationFrame = undefined;
    if (!inspector.enabled()) {
      setFrames([]);
      return;
    }
    setFrames(inspector.markers().flatMap(frameForMarker));
  };
  const schedule = () => {
    if (animationFrame === undefined) animationFrame = requestAnimationFrame(measure);
  };

  createEffect(() => {
    if (!inspector.enabled()) {
      setFrames([]);
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && inspector.enabled()) inspector.setEnabled(false);
    };
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
    const observeElements = (root: ParentNode) => {
      if (root instanceof HTMLElement) observer?.observe(root);
      for (const element of root.querySelectorAll<HTMLElement>("*")) observer?.observe(element);
    };
    for (const marker of inspector.markers()) observeElements(marker.anchor);
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations)
        for (const node of mutation.addedNodes)
          if (node instanceof HTMLElement && !node.closest("[data-extension-inspector-overlay]")) observeElements(node);
      if (mutations.every((mutation) => (mutation.target as Element).closest?.("[data-extension-inspector-overlay]"))) {
        return;
      }
      schedule();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("keydown", onKeyDown);
    schedule();
    onCleanup(() => {
      observer?.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("keydown", onKeyDown);
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
    });
  });

  return (
    <Show when={inspector.enabled()}>
      <Portal>
        <div class={styles.overlay} data-extension-inspector-overlay aria-hidden="true">
          <For each={frames()}>
            {(frame) => (
              <div
                class={`${styles.frame} ${frame.kind === "extension" ? styles.extension : styles.extensionPoint}`}
                style={{
                  left: `${frame.left}px`,
                  top: `${frame.top}px`,
                  width: `${frame.width}px`,
                  height: `${frame.height}px`,
                }}
              >
                <span class={styles.label}>{frame.id}</span>
              </div>
            )}
          </For>
        </div>
      </Portal>
    </Show>
  );
}

function frameForMarker(marker: InspectorMarker): InspectorFrame[] {
  if (!marker.anchor.isConnected) return [];
  const rectangles = [...marker.anchor.querySelectorAll<HTMLElement>("*")]
    .map((element) => element.getBoundingClientRect())
    .filter((rectangle) => rectangle.width > 0 && rectangle.height > 0);
  if (!rectangles.length) return [];
  const left = Math.max(0, Math.min(...rectangles.map((rectangle) => rectangle.left)));
  const top = Math.max(0, Math.min(...rectangles.map((rectangle) => rectangle.top)));
  const right = Math.min(window.innerWidth, Math.max(...rectangles.map((rectangle) => rectangle.right)));
  const bottom = Math.min(window.innerHeight, Math.max(...rectangles.map((rectangle) => rectangle.bottom)));
  if (right <= left || bottom <= top) return [];
  return [{ ...marker, left, top, width: right - left, height: bottom - top }];
}
