import { createMemo, Show, type ParentProps } from "solid-js";
import XIcon from "lucide-solid/icons/x";
import { Tabs, type TabDefinition } from "../../../components/tabs/Tabs";
import type { MasterDetailDefinition } from "../master-detail/definition";
import type { DataChangeService } from "../data-changes/data-change-service";
import { useOptionalEntityHistoryService } from "./entity-history-context";
import { createEntityHistoryStore } from "./entity-history-store";
import { HistoryEntries } from "./HistoryEntries";
import styles from "./HistoryEntries.module.css";

/** Rendering adapter retaining the edit form while a separate history store loads audit pages. */
export function RecordHistoryDetails(
  props: ParentProps<{
    definition: MasterDetailDefinition;
    recordId: string;
    dataChanges: DataChangeService;
    onClose: () => void;
  }>,
) {
  const service = useOptionalEntityHistoryService();
  if (!service) return props.children;
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
        <div class={styles.toolbar}>
          <button type="button" aria-label="Close details" onClick={props.onClose}>
            <XIcon size={16} />
          </button>
        </div>
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
        keepMounted
        tabs={tabs()}
        selected={store.enabled() ? store.tab() : "details"}
        onSelect={store.selectTab}
      />
    </>
  );
}
