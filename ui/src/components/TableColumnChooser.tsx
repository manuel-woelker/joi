import { createMemo, createSignal, createUniqueId, For, Show, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import ArrowUpIcon from "lucide-solid/icons/arrow-up";
import ArrowDownIcon from "lucide-solid/icons/arrow-down";
import GripVerticalIcon from "lucide-solid/icons/grip-vertical";
import Trash2Icon from "lucide-solid/icons/trash-2";
import { CloseButton } from "./CloseButton";
import { IconButton } from "./IconButton";
import { ModelText } from "./SourceText";
import { Select } from "./Select";
import {
  addTableColumn,
  moveTableColumn,
  removeTableColumn,
  visibleColumnOrder,
  type DataTableColumnConfig,
} from "./table-column-config";
import styles from "./TableColumnChooser.module.css";

export interface TableColumnChoice {
  readonly id: string;
  readonly label: string;
  readonly type?: string;
  readonly description?: string;
}

/** Presentation-only editor for a normalized column configuration. */
export function TableColumnChooser(props: {
  anchor: HTMLElement;
  columns: readonly TableColumnChoice[];
  config: DataTableColumnConfig;
  onChange: (config: DataTableColumnConfig) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  let surface!: HTMLDivElement;
  const selectId = createUniqueId();
  const [position, setPosition] = createSignal({ left: 0, top: 0, height: 400 });
  const [dragged, setDragged] = createSignal<string>();
  const visible = () => visibleColumnOrder(props.config);
  const hidden = createMemo(() => props.columns.filter((column) => !visible().includes(column.id)));
  const close = () => {
    props.onClose();
    props.anchor.focus();
  };
  onMount(() => {
    const place = () => {
      const rect = props.anchor.getBoundingClientRect();
      const height = Math.min(440, window.innerHeight - 16);
      setPosition({
        left: Math.max(8, Math.min(rect.right - 320, window.innerWidth - 328)),
        top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8)),
        height,
      });
    };
    place();
    surface.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      // Select owns a portaled listbox; clicks there belong to this chooser.
      if (
        !surface.contains(target) &&
        !props.anchor.contains(target) &&
        !document.getElementById(`${selectId}-listbox`)?.contains(target)
      )
        props.onClose();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside);
    onCleanup(() => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
    });
  });
  return (
    <Portal>
      <div
        ref={surface}
        class={styles.chooser}
        role="dialog"
        aria-label="Table columns"
        tabIndex={-1}
        style={{ left: `${position().left}px`, top: `${position().top}px`, "max-height": `${position().height}px` }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.stopPropagation();
            close();
          }
        }}
      >
        <header class={styles.header}>
          <span>Columns</span>
          <CloseButton label="Close columns" onClick={close} />
        </header>
        <Show keyed when={hidden()}>
          {(choices) => (
            <Select
              id={selectId}
              value=""
              ariaLabel="Add column"
              placeholder="Add column"
              density="compact"
              disabled={!choices.length}
              loadEntries={async () => ({ entries: choices, total: choices.length })}
              entryId={(entry) => entry.id}
              entryText={(entry) => entry.label}
              renderEntry={(entry) => (
                <div>
                  <ModelText>{entry.label}</ModelText>
                  <small class={styles.description}>
                    {entry.type}
                    {entry.description ? ` - ${entry.description}` : ""}
                  </small>
                </div>
              )}
              onChange={(id) => props.onChange(addTableColumn(props.config, id))}
            />
          )}
        </Show>
        <ol class={styles.list}>
          <For each={visible()}>
            {(id, index) => (
              <li
                class={styles.row}
                classList={{ [styles.dragged]: dragged() === id }}
                onDragOver={(event) => {
                  if (dragged()) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const source = dragged();
                  if (source) props.onChange(moveTableColumn(props.config, source, index()));
                  setDragged();
                }}
              >
                <button
                  type="button"
                  class={styles.handle}
                  draggable
                  aria-label={`Drag ${props.columns.find((column) => column.id === id)?.label}`}
                  onDragStart={(event) => {
                    setDragged(id);
                    if (event.dataTransfer) {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", id);
                    }
                  }}
                  onDragEnd={() => setDragged()}
                >
                  <GripVerticalIcon size={14} />
                </button>
                <span class={styles.label}>
                  <ModelText>{props.columns.find((column) => column.id === id)?.label ?? id}</ModelText>
                </span>
                <IconButton
                  type="button"
                  label={`Move ${props.columns.find((column) => column.id === id)?.label ?? id} up`}
                  disabled={index() === 0}
                  icon={<ArrowUpIcon size={14} />}
                  onClick={() => props.onChange(moveTableColumn(props.config, id, index() - 1))}
                />
                <IconButton
                  type="button"
                  label={`Move ${props.columns.find((column) => column.id === id)?.label ?? id} down`}
                  disabled={index() === visible().length - 1}
                  icon={<ArrowDownIcon size={14} />}
                  onClick={() => props.onChange(moveTableColumn(props.config, id, index() + 1))}
                />
                <IconButton
                  type="button"
                  label={
                    visible().length === 1
                      ? "Keep at least one column"
                      : `Remove ${props.columns.find((column) => column.id === id)?.label ?? id}`
                  }
                  disabled={visible().length === 1}
                  icon={<Trash2Icon size={14} />}
                  onClick={() => props.onChange(removeTableColumn(props.config, id))}
                />
              </li>
            )}
          </For>
        </ol>
        <button type="button" onClick={props.onReset}>
          Reset columns
        </button>
      </div>
    </Portal>
  );
}
