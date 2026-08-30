import { Show, type JSX } from "solid-js";

import type { QueryResult } from "../query/query-result";
import type { FetchService } from "../services/fetch-service";
import type { MasterDetailDefinition } from "./definition";
import { RecordEditor } from "./RecordEditor";
import styles from "./MasterDetailView.module.css";

export function MasterDetailView(props: {
  master: JSX.Element;
  definition: MasterDetailDefinition;
  fetchService: FetchService;
  result?: QueryResult;
  selectedRecordId?: string;
  creating?: boolean;
  onCreated: (recordId: string) => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div class={styles.layout} classList={{ [styles.withDetail]: Boolean(props.selectedRecordId || props.creating) }}>
      <div class={styles.master}>{props.master}</div>
      <Show when={props.selectedRecordId && props.result}>
        <aside class={styles.detail} aria-label={`${props.definition.detailTitle} details`}>
          <RecordEditor
            definition={props.definition}
            fetchService={props.fetchService}
            mode={{ type: "edit", result: props.result!, recordId: props.selectedRecordId! }}
            onClose={props.onClose}
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
