import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

import styles from "./Select.module.css";

export interface SelectEntries<T> {
  readonly entries: readonly T[];
  readonly total: number;
}

export interface SelectProps<T> {
  readonly ariaLabel: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Loads matches. The initial request includes the selected ID so remote sources can include it. */
  readonly loadEntries: (query: string, selectedId?: string) => Promise<SelectEntries<T>>;
  readonly entryId: (entry: T) => string;
  readonly entryText: (entry: T) => string;
  readonly renderEntry?: (entry: T) => JSX.Element;
  readonly placeholder?: string;
  readonly emptyLabel?: string;
  readonly disabled?: boolean;
  readonly localFilterLimit?: number;
  readonly debounceMs?: number;
  readonly id?: string;
  readonly required?: boolean;
  readonly invalid?: boolean;
  readonly describedBy?: string;
  readonly onBlur?: JSX.EventHandler<HTMLInputElement, FocusEvent>;
}

/** Searchable asynchronous combobox with automatic local filtering for small data sets. */
export function Select<T>(props: SelectProps<T>) {
  let root: HTMLDivElement | undefined;
  let popup: HTMLDivElement | undefined;
  let input: HTMLInputElement | undefined;
  const listboxId = `${props.id ?? "select"}-listbox`;
  const [open, setOpen] = createSignal(false);
  const [search, setSearch] = createSignal("");
  const [entries, setEntries] = createSignal<readonly T[]>([]);
  const [entryCache, setEntryCache] = createSignal<ReadonlyMap<string, T>>(new Map());
  const [localEntries, setLocalEntries] = createSignal<readonly T[]>();
  const [loading, setLoading] = createSignal(true);
  const [initialized, setInitialized] = createSignal(false);
  const [error, setError] = createSignal<Error>();
  const [activeIndex, setActiveIndex] = createSignal(0);
  const [popupPosition, setPopupPosition] = createSignal({
    left: 0,
    top: 0,
    bottom: 0,
    width: 0,
    height: 260,
    above: false,
  });
  let request = 0;

  const selectedEntry = createMemo(() => {
    return entryCache().get(props.value);
  });
  const visibleEntries = createMemo(() => {
    const local = localEntries();
    if (!local) return entries();
    const normalized = search().trim().toLocaleLowerCase();
    return normalized
      ? local.filter((entry) => props.entryText(entry).toLocaleLowerCase().includes(normalized))
      : local;
  });
  const displayValue = () => (open() ? search() : selectedEntry() ? props.entryText(selectedEntry()!) : "");

  const load = async (query: string, initial = false) => {
    const currentRequest = ++request;
    setLoading(true);
    setError();
    try {
      const result = await (initial && props.value ? props.loadEntries(query, props.value) : props.loadEntries(query));
      if (currentRequest !== request) return;
      setEntryCache((cache) => {
        const updated = new Map(cache);
        for (const entry of result.entries) updated.set(props.entryId(entry), entry);
        return updated;
      });
      if (initial && result.total < (props.localFilterLimit ?? 1000)) setLocalEntries(result.entries);
      else setEntries(result.entries);
      setActiveIndex(0);
    } catch (reason) {
      if (currentRequest === request)
        setError(reason instanceof Error ? reason : new Error("Entries could not be loaded"));
    } finally {
      if (currentRequest === request) setLoading(false);
      if (initial && currentRequest === request) setInitialized(true);
    }
  };

  onMount(() => void load("", true));
  createEffect(() => {
    const query = search();
    if (!initialized() || !open() || localEntries() !== undefined) return;
    const timer = window.setTimeout(() => void load(query), props.debounceMs ?? 200);
    onCleanup(() => window.clearTimeout(timer));
  });
  onMount(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (root && !root.contains(target) && !popup?.contains(target)) close();
    };
    document.addEventListener("pointerdown", closeOutside);
    onCleanup(() => document.removeEventListener("pointerdown", closeOutside));
  });
  createEffect(() => {
    if (!open()) return;
    const updatePosition = () => {
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 6;
      const above = rect.top - 6;
      const opensAbove = below < 180 && above > below;
      setPopupPosition({
        left: Math.max(6, Math.min(rect.left, window.innerWidth - rect.width - 6)),
        top: rect.bottom + 4,
        bottom: window.innerHeight - rect.top + 4,
        width: Math.min(rect.width, window.innerWidth - 12),
        height: Math.max(96, Math.min(300, opensAbove ? above : below)),
        above: opensAbove,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(updatePosition);
    if (root) observer?.observe(root);
    onCleanup(() => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
      observer?.disconnect();
    });
  });

  const show = () => {
    if (props.disabled) return;
    setSearch("");
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setSearch("");
  };
  const choose = (entry: T | undefined) => {
    props.onChange(entry ? props.entryId(entry) : "");
    close();
    input?.focus();
  };
  const move = (offset: number) => {
    const count = visibleEntries().length + (props.emptyLabel ? 1 : 0);
    if (count) setActiveIndex((activeIndex() + offset + count) % count);
  };
  const activeEntry = () => {
    const index = activeIndex() - (props.emptyLabel ? 1 : 0);
    return index < 0 ? undefined : visibleEntries()[index];
  };

  return (
    <div ref={root} class={styles.root}>
      <div class={styles.control} classList={{ [styles.open]: open(), [styles.invalid]: props.invalid }}>
        <input
          ref={input}
          id={props.id}
          role="combobox"
          aria-label={props.ariaLabel}
          aria-expanded={open()}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-invalid={props.invalid}
          aria-describedby={props.describedBy}
          autocomplete="off"
          disabled={props.disabled}
          required={props.required}
          placeholder={props.placeholder}
          value={displayValue()}
          onFocus={show}
          onClick={show}
          onInput={(event) => {
            setSearch(event.currentTarget.value);
            setOpen(true);
          }}
          onBlur={props.onBlur}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open()) show();
              move(event.key === "ArrowDown" ? 1 : -1);
            } else if (event.key === "Enter" && open()) {
              event.preventDefault();
              const entry = activeEntry();
              if (entry || (props.emptyLabel && activeIndex() === 0)) choose(entry);
            } else if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
        />
        <button
          type="button"
          tabindex={-1}
          aria-label={`Toggle ${props.ariaLabel}`}
          disabled={props.disabled}
          onClick={() => (open() ? close() : show())}
        >
          <span aria-hidden="true">⌄</span>
        </button>
      </div>
      <Show when={open()}>
        <Portal>
          <div
            ref={popup}
            class={styles.popup}
            style={`left:${popupPosition().left}px;width:${popupPosition().width}px;${popupPosition().above ? `bottom:${popupPosition().bottom}px` : `top:${popupPosition().top}px`};--select-list-height:${popupPosition().height}px`}
          >
            <ul id={listboxId} role="listbox" aria-label={`${props.ariaLabel} options`}>
              <Show when={props.emptyLabel}>
                {(label) => (
                  <li
                    role="option"
                    aria-selected={props.value === ""}
                    classList={{ [styles.active]: activeIndex() === 0 }}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => choose(undefined)}
                  >
                    {label()}
                  </li>
                )}
              </Show>
              <For each={visibleEntries()}>
                {(entry, index) => {
                  const optionIndex = () => index() + (props.emptyLabel ? 1 : 0);
                  return (
                    <li
                      role="option"
                      aria-selected={props.entryId(entry) === props.value}
                      classList={{ [styles.active]: activeIndex() === optionIndex() }}
                      onPointerEnter={() => setActiveIndex(optionIndex())}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => choose(entry)}
                    >
                      {props.renderEntry?.(entry) ?? props.entryText(entry)}
                    </li>
                  );
                }}
              </For>
            </ul>
            <Show when={loading()}>
              <div class={styles.state}>Loading...</div>
            </Show>
            <Show when={!loading() && error()}>
              <div class={`${styles.state} ${styles.error}`} role="alert">
                {error()!.message}
              </div>
            </Show>
            <Show when={!loading() && !error() && visibleEntries().length === 0}>
              <div class={styles.state}>No matches</div>
            </Show>
          </div>
        </Portal>
      </Show>
    </div>
  );
}
