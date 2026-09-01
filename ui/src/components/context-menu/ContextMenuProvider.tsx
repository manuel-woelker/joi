import {
  createContext,
  createSignal,
  createUniqueId,
  For,
  onCleanup,
  onMount,
  type ParentProps,
  Show,
  useContext,
} from "solid-js";
import { Portal } from "solid-js/web";
import { KeyboardShortcut } from "../KeyboardShortcut";
import styles from "./ContextMenu.module.css";
import {
  type ContextMenuController,
  type ContextMenuEntry,
  type ContextMenuGroup,
  type OpenContextMenuOptions,
  validateContextMenuGroups,
} from "./context-menu";

interface MenuSnapshot {
  readonly groups: readonly ContextMenuGroup[];
  readonly x: number;
  readonly y: number;
  readonly previousFocus?: HTMLElement;
}

const ContextMenuContext = createContext<ContextMenuController>();

export function ContextMenuProvider(props: ParentProps) {
  const [snapshot, setSnapshot] = createSignal<MenuSnapshot>();
  const close = (restoreFocus = true) => {
    const current = snapshot();
    setSnapshot(undefined);
    if (restoreFocus && current?.previousFocus?.isConnected) current.previousFocus.focus();
  };
  const controller: ContextMenuController = {
    open(options: OpenContextMenuOptions) {
      const groups = options.createGroups({
        event: options.event,
        x: options.event.clientX,
        y: options.event.clientY,
      });
      validateContextMenuGroups(groups);
      const populatedGroups = groups.filter((group) => group.entries.length > 0);
      if (!populatedGroups.length) {
        close(false);
        return;
      }
      options.event.preventDefault();
      const previousFocus =
        snapshot()?.previousFocus ??
        (document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
      setSnapshot({ groups: populatedGroups, x: options.event.clientX, y: options.event.clientY, previousFocus });
    },
    close,
  };

  return (
    <ContextMenuContext.Provider value={controller}>
      {props.children}
      <Show keyed when={snapshot()}>
        {(current) => <ContextMenuSurface snapshot={current} close={close} />}
      </Show>
    </ContextMenuContext.Provider>
  );
}

function ContextMenuSurface(props: { snapshot: MenuSnapshot; close: (restoreFocus?: boolean) => void }) {
  let menu: HTMLDivElement | undefined;
  const entryElements = new Map<string, HTMLButtonElement>();
  const [position, setPosition] = createSignal({ left: props.snapshot.x, top: props.snapshot.y, ready: false });
  const enabledEntries = () =>
    props.snapshot.groups.flatMap((group) => group.entries).filter((entry) => !entry.disabled);

  const invoke = (entry: ContextMenuEntry, restoreFocus: boolean) => {
    if (entry.disabled) return;
    props.close(restoreFocus);
    try {
      void Promise.resolve(entry.execute()).catch(reportExecutionError);
    } catch (error) {
      reportExecutionError(error);
    }
  };
  const focusEntry = (entry: ContextMenuEntry | undefined) => {
    if (!entry) return;
    entryElements.get(entry.id)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const entries = enabledEntries();
    const currentIndex = entries.findIndex((entry) => entry.id === (event.target as HTMLElement).dataset.entryId);
    const destination =
      event.key === "ArrowDown"
        ? entries[(Math.max(currentIndex, -1) + 1) % entries.length]
        : event.key === "ArrowUp"
          ? entries[(currentIndex <= 0 ? entries.length : currentIndex) - 1]
          : event.key === "Home"
            ? entries[0]
            : event.key === "End"
              ? entries.at(-1)
              : undefined;
    if (destination) {
      event.preventDefault();
      focusEntry(destination);
    } else if (event.key === "Enter" || event.key === " ") {
      const entry = entries[currentIndex];
      if (entry) {
        event.preventDefault();
        invoke(entry, true);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      props.close(true);
    }
  };

  onMount(() => {
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    const margin = 8;
    setPosition({
      left: Math.max(margin, Math.min(props.snapshot.x, window.innerWidth - bounds.width - margin)),
      top: Math.max(margin, Math.min(props.snapshot.y, window.innerHeight - bounds.height - margin)),
      ready: true,
    });
    const firstEntry = enabledEntries()[0];
    if (firstEntry) focusEntry(firstEntry);
    else menu.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!menu?.contains(event.target as Node)) props.close(false);
    };
    const closeWithoutFocus = () => props.close(false);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", closeWithoutFocus);
    window.addEventListener("resize", closeWithoutFocus);
    window.addEventListener("scroll", closeWithoutFocus, true);
    onCleanup(() => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", closeWithoutFocus);
      window.removeEventListener("resize", closeWithoutFocus);
      window.removeEventListener("scroll", closeWithoutFocus, true);
    });
  });

  return (
    <Portal>
      <div
        ref={menu}
        class={styles.menu}
        role="menu"
        tabIndex={-1}
        aria-label="Context menu"
        style={{
          left: `${position().left}px`,
          top: `${position().top}px`,
          visibility: position().ready ? "visible" : "hidden",
        }}
        onKeyDown={onKeyDown}
      >
        <For each={props.snapshot.groups}>
          {(group, groupIndex) => (
            <section
              class={styles.group}
              classList={{ [styles.separated]: groupIndex() > 0 }}
              role="group"
              aria-label={group.label}
            >
              <Show when={group.label}>{(label) => <div class={styles.groupLabel}>{label()}</div>}</Show>
              <For each={group.entries}>
                {(entry) => (
                  <ContextMenuItem
                    entry={entry}
                    registerElement={(element) => entryElements.set(entry.id, element)}
                    invoke={() => invoke(entry, false)}
                  />
                )}
              </For>
            </section>
          )}
        </For>
      </div>
    </Portal>
  );
}

function ContextMenuItem(props: {
  entry: ContextMenuEntry;
  registerElement(element: HTMLButtonElement): void;
  invoke(): void;
}) {
  let button: HTMLButtonElement | undefined;
  const tooltipId = `context-menu-description-${createUniqueId()}`;
  const [hovered, setHovered] = createSignal(false);
  const [focused, setFocused] = createSignal(false);
  const tooltipVisible = () => Boolean(props.entry.description && (hovered() || focused()));
  return (
    <>
      <button
        ref={(element) => {
          button = element;
          props.registerElement(element);
        }}
        type="button"
        role="menuitem"
        class={styles.entry}
        data-entry-id={props.entry.id}
        disabled={props.entry.disabled}
        aria-disabled={props.entry.disabled ? "true" : undefined}
        aria-describedby={props.entry.description ? tooltipId : undefined}
        tabIndex={-1}
        onMouseEnter={(event) => {
          setHovered(true);
          if (!props.entry.disabled) event.currentTarget.focus();
        }}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={props.invoke}
      >
        <span class={styles.icon} aria-hidden="true">
          {props.entry.icon?.()}
        </span>
        <span class={styles.entryLine}>
          <span class={styles.label}>{props.entry.label}</span>
          <Show when={props.entry.keyboardHint}>
            {(hint) => <KeyboardShortcut class={styles.hint} shortcut={hint()} />}
          </Show>
        </span>
      </button>
      <Show when={tooltipVisible() && button && props.entry.description}>
        <ContextMenuTooltip id={tooltipId} anchor={button!} description={props.entry.description!} />
      </Show>
    </>
  );
}

function ContextMenuTooltip(props: { id: string; anchor: HTMLElement; description: string }) {
  let tooltip: HTMLDivElement | undefined;
  const [position, setPosition] = createSignal({ left: 0, top: 0, ready: false });
  onMount(() => {
    if (!tooltip) return;
    const anchor = props.anchor.getBoundingClientRect();
    const bounds = tooltip.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const right = anchor.right + gap;
    const left = right + bounds.width <= window.innerWidth - margin ? right : anchor.left - bounds.width - gap;
    setPosition({
      left: Math.max(margin, Math.min(left, window.innerWidth - bounds.width - margin)),
      top: Math.max(margin, Math.min(anchor.top, window.innerHeight - bounds.height - margin)),
      ready: true,
    });
  });
  return (
    <Portal>
      <div
        ref={tooltip}
        id={props.id}
        role="tooltip"
        class={styles.tooltip}
        style={{
          left: `${position().left}px`,
          top: `${position().top}px`,
          visibility: position().ready ? "visible" : "hidden",
        }}
      >
        {props.description}
      </div>
    </Portal>
  );
}

function reportExecutionError(error: unknown): void {
  console.error("Context menu entry execution failed", error);
}

export function useContextMenu(): ContextMenuController {
  const controller = useContext(ContextMenuContext);
  if (!controller) throw new Error("useContextMenu must be called inside a ContextMenuProvider");
  return controller;
}
