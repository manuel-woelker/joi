import { For, Show, createMemo, createResource } from "solid-js";
import type { HistoryEntry } from "../../../generated/api/api";
import { DataText, ModelText } from "../../../components/SourceText";
import { DateTime } from "../../../components/DateTime";
import type { EditFieldDefinition } from "../master-detail/definition";
import { lookupEntryId, lookupId, useOptionalLookupService } from "../lookups/lookup";
import styles from "./HistoryEntries.module.css";
import { formatHistoryValue, historyValueDiff } from "./history-value";

/** Read-only audit entries with safe rich text; unknown users and attributes retain their stored IDs. */
export function HistoryEntries(props: { entries: readonly HistoryEntry[]; fields: readonly EditFieldDefinition[] }) {
  const lookups = useOptionalLookupService();
  const userLabel = (userid: string) =>
    userid === "system"
      ? Promise.resolve("System")
      : (lookups?.label(lookupId("users"), lookupEntryId(userid)).catch(() => userid) ?? Promise.resolve(userid));
  const valueLabel = async (key: string, value: unknown) => {
    const field = props.fields.find((field) => field.attribute === key);
    if (field?.lookup && lookups && typeof value === "string" && value) {
      const label = await lookups.label(field.lookup, lookupEntryId(value)).catch(() => value);
      return label;
    }
    return formatHistoryValue(value);
  };
  return (
    <div class={styles.entries}>
      <Show when={props.entries.length} fallback={<p class={styles.empty}>No recorded changes.</p>}>
        <table class={styles.changes} aria-label="Attribute changes">
          <thead>
            <tr>
              <th scope="col">Attribute</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
            </tr>
          </thead>
          <For each={props.entries}>
            {(entry) => (
              <tbody aria-label={`${entry.type} change`}>
                <tr>
                  <th scope="rowgroup" colSpan={3} class={styles.entry}>
                    <div class={styles.header}>
                      <span>{entry.type}</span>
                      <ResolvedText
                        fallback={entry.userid === "system" ? "System" : entry.userid}
                        load={() => userLabel(entry.userid)}
                      />
                      <DateTime value={entry.timestamp} />
                    </div>
                  </th>
                </tr>
                <For each={entry.changes}>
                  {(change) => {
                    const [labels] = createResource(
                      () => [change.key, change.oldValue, change.newValue] as const,
                      ([key, before, after]) => Promise.all([valueLabel(key, before), valueLabel(key, after)]),
                    );
                    const diff = createMemo(() =>
                      historyValueDiff(
                        labels()?.[0] ?? formatHistoryValue(change.oldValue),
                        labels()?.[1] ?? formatHistoryValue(change.newValue),
                        props.fields.find((field) => field.attribute === change.key)?.control === "html",
                        styles.removed,
                        styles.added,
                        change.oldValue !== undefined && change.newValue !== undefined,
                      ),
                    );
                    return (
                      <tr>
                        <th scope="row">
                          <ModelText>
                            {props.fields.find((field) => field.attribute === change.key)?.label ?? change.key}
                          </ModelText>
                        </th>
                        <td>
                          <div class={styles.value} innerHTML={diff().before} />
                        </td>
                        <td>
                          <div class={styles.value} innerHTML={diff().after} />
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            )}
          </For>
        </table>
      </Show>
    </div>
  );
}

function ResolvedText(props: { fallback: string; load: () => Promise<string> }) {
  const [label] = createResource(
    () => props.load,
    (load) => load(),
  );
  const text = () => label() ?? props.fallback;
  return (
    <Show when={text().length > 180} fallback={<DataText>{text()}</DataText>}>
      <details>
        <summary>
          <DataText>{text().slice(0, 120)}...</DataText>
        </summary>
        <DataText>{text()}</DataText>
      </details>
    </Show>
  );
}
