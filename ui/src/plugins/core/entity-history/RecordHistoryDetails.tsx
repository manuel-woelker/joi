import Maximize2Icon from "lucide-solid/icons/maximize-2";
import { createMemo, type JSX, type ParentProps, Show } from "solid-js";
import { CloseButton } from "../../../components/CloseButton";
import { IconButton } from "../../../components/IconButton";
import { type TabDefinition, Tabs } from "../../../components/tabs/Tabs";
import type { DataChangeService } from "../data-changes/data-change-service";
import type { EntityEditorDefinition } from "../entity-editor/definition";
import { useOptionalEntityHistoryService } from "./entity-history-context";
import { createEntityHistoryStore } from "./entity-history-store";
import { HistoryEntries } from "./HistoryEntries";
import styles from "./HistoryEntries.module.css";

/** Rendering adapter retaining the edit form while a separate history store loads audit pages. */
export function RecordHistoryDetails(
  props: ParentProps<{
    definition: EntityEditorDefinition;
    recordId: string;
    dataChanges: DataChangeService;
    onClose: () => void;
    onOpenPage?: () => void;
    heading?: JSX.Element;
  }>,
) {
  const service = useOptionalEntityHistoryService();
  const closeButton = () => (
    <>
      <Show when={props.onOpenPage}>
        {(open) => <IconButton label="Open entity page" icon={<Maximize2Icon size={16} />} onClick={open()} />}
      </Show>
      <CloseButton label="Close details" onClick={props.onClose} />
    </>
  );
  if (!service)
    return (
      <>
        {props.heading}
        <div class={styles.toolbar}>{closeButton()}</div>
        {props.children}
      </>
    );
  const store = createEntityHistoryStore(
    { table: () => props.definition.tableName, recordId: () => props.recordId },
    { service, dataChanges: props.dataChanges },
  );
  const details: TabDefinition = { id: "details", label: "Details", render: () => props.children };
  const history: TabDefinition = {
    id: "history",
    label: "History",
    render: () => (
      <>
        <Show when={store.loading()}>
          <p role="status">Loading history...</p>
        </Show>
        <Show when={!store.loading() || store.entries().length > 0}>
          <HistoryEntries entries={store.entries()} fields={props.definition.fields} />
        </Show>
        <Show when={store.cursor()}>
          <div class={styles.footer}>
            <button type="button" disabled={store.loading()} onClick={store.loadMore}>
              Load more
            </button>
          </div>
        </Show>
      </>
    ),
  };
  const tabs = createMemo(() => (store.enabled() ? [details, history] : [details]));
  return (
    <>
      {props.heading}
      <Show when={store.error()}>
        <div class={styles.error} role="alert">
          {store.error()}{" "}
          <button type="button" onClick={store.retry}>
            Retry history
          </button>
        </div>
      </Show>
      <Tabs
        ariaLabel="Record details"
        headerActions={closeButton()}
        keepMounted
        tabs={tabs()}
        selected={store.enabled() ? store.tab() : "details"}
        onSelect={store.selectTab}
      />
    </>
  );
}
