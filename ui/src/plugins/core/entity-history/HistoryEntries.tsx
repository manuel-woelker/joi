import { For, Show, createResource } from "solid-js";
import type { HistoryEntry } from "../../../generated/api/api";
import { DataText, ModelText } from "../../../components/SourceText";
import { DateTime } from "../../../components/DateTime";
import type { EditFieldDefinition } from "../master-detail/definition";
import { lookupEntryId, lookupId, useOptionalLookupService } from "../lookups/lookup";
import styles from "./HistoryEntries.module.css";

/** Read-only, escaped audit entries; unknown users and attributes retain their stored IDs. */
export function HistoryEntries(props: { entries: readonly HistoryEntry[]; fields: readonly EditFieldDefinition[] }) {
  const lookups = useOptionalLookupService();
  const userLabel = (userid: string) =>
    userid === "system"
      ? Promise.resolve("System")
      : (lookups?.label(lookupId("users"), lookupEntryId(userid)).catch(() => userid) ?? Promise.resolve(userid));
  const valueLabel = async (key: string, value: unknown) => {
    if (value === undefined) return "Not present";
    const field = props.fields.find((field) => field.attribute === key);
    if (field?.lookup && lookups && typeof value === "string" && value) {
      const label = await lookups.label(field.lookup, lookupEntryId(value)).catch(() => value);
      return JSON.stringify(label);
    }
    return JSON.stringify(value);
  };
  return (
    <div class={styles.entries}>
      <For each={props.entries} fallback={<p class={styles.empty}>No recorded changes.</p>}>
        {(entry) => (
          <article class={styles.entry} aria-label={`${entry.type} change`}>
            <header class={styles.header}>
              <span>{entry.type}</span>
              <ResolvedText
                fallback={entry.userid === "system" ? "System" : entry.userid}
                load={() => userLabel(entry.userid)}
              />
              <DateTime value={entry.timestamp} />
            </header>
            <table class={styles.changes} aria-label="Attribute changes">
              <thead>
                <tr>
                  <th>Attribute</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                <For each={entry.changes}>
                  {(change) => (
                    <tr>
                      <th scope="row">
                        <ModelText>
                          {props.fields.find((field) => field.attribute === change.key)?.label ?? change.key}
                        </ModelText>
                      </th>
                      <td>
                        <ResolvedText
                          fallback={formatValue(change.oldValue)}
                          load={() => valueLabel(change.key, change.oldValue)}
                        />
                      </td>
                      <td>
                        <ResolvedText
                          fallback={formatValue(change.newValue)}
                          load={() => valueLabel(change.key, change.newValue)}
                        />
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </article>
        )}
      </For>
    </div>
  );
}

function formatValue(value: unknown): string {
  return value === undefined ? "Not present" : JSON.stringify(value);
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
