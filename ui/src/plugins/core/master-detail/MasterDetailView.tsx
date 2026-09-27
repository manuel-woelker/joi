import { type JSX, Show } from "solid-js";
import type { FetchService } from "../../../base/services/fetch-service";
import type { EntityEditorDefinition } from "../entity-editor/definition";
import { RecordEditor } from "../entity-editor/RecordEditor";
import type { QueryResult } from "../query/query-result";
import styles from "./MasterDetailView.module.css";

export function MasterDetailView(props: {
  master: JSX.Element;
  leadingPanel?: JSX.Element;
  definition: EntityEditorDefinition;
  fetchService: FetchService;
  result?: QueryResult;
  selectedRecordId?: string;
  creating?: boolean;
  onCreated: (recordId: string) => void | Promise<void>;
  onClose: () => void;
  onOpenPage?: () => void;
}) {
  return (
    <div
      class={styles.layout}
      classList={{
        [styles.withLeadingPanel]: Boolean(props.leadingPanel),
        [styles.withDetail]: Boolean(props.selectedRecordId || props.creating),
      }}
    >
      <Show when={props.leadingPanel}>
        <aside class={styles.leadingPanel}>{props.leadingPanel}</aside>
      </Show>
      <div class={styles.master}>{props.master}</div>
      <Show when={props.selectedRecordId && props.result}>
        <aside class={styles.detail} aria-label={`${props.definition.detailTitle} details`}>
          <RecordEditor
            definition={props.definition}
            fetchService={props.fetchService}
            mode={{ type: "edit", result: props.result!, recordId: props.selectedRecordId! }}
            onClose={props.onClose}
            onOpenPage={props.onOpenPage}
          />
        </aside>
      </Show>
      <Show when={props.creating}>
        <aside class={styles.detail} aria-label={`New ${props.definition.detailTitle}`}>
          <RecordEditor
            definition={props.definition}
            fetchService={props.fetchService}
            mode={{ type: "create", onCreated: props.onCreated }}
            onClose={props.onClose}
          />
        </aside>
      </Show>
    </div>
  );
}
