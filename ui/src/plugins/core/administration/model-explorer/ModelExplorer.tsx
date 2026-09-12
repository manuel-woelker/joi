import KeyIcon from "lucide-solid/icons/key-round";
import LinkIcon from "lucide-solid/icons/link";
import TableIcon from "lucide-solid/icons/table-2";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";

import type { FetchService } from "../../../../base/services/fetch-service";
import { loadModelInfo } from "./model-info-api";
import styles from "./ModelExplorer.module.css";

export function ModelExplorer(props: { fetchService: FetchService }) {
  const [response] = createResource(() => loadModelInfo(props.fetchService));
  const [selectedName, setSelectedName] = createSignal<string>();
  const selected = createMemo(() => {
    const models = response()?.models ?? [];
    return models.find((model) => model.name === selectedName()) ?? models[0];
  });

  return (
    <Show when={!response.loading} fallback={<p class={styles.message}>Loading application model...</p>}>
      <Show when={!response.error} fallback={<p class={styles.error}>Could not load the application model.</p>}>
        <Show when={response()?.models.length} fallback={<p class={styles.message}>No discoverable models.</p>}>
          <div class={styles.explorer}>
            <nav class={styles.modelList} aria-label="Model types">
              <For each={response()?.models}>
                {(model) => (
                  <button
                    type="button"
                    class={styles.modelButton}
                    classList={{ [styles.selected]: selected()?.name === model.name }}
                    onClick={() => setSelectedName(model.name)}
                  >
                    <TableIcon size={16} aria-hidden="true" />
                    <span>{model.name}</span>
                    <small>{model.attributes.length}</small>
                  </button>
                )}
              </For>
            </nav>
            <Show when={selected()}>
              {(model) => (
                <section class={styles.modelDetail} aria-labelledby="selected-model-name">
                  <header class={styles.modelHeader}>
                    <div>
                      <p>Model type</p>
                      <h2 id="selected-model-name">{model().name}</h2>
                    </div>
                    <span>{model().attributes.length} attributes</span>
                  </header>
                  <div class={styles.tableScroller}>
                    <table class={styles.attributeTable}>
                      <thead>
                        <tr>
                          <th scope="col">Attribute</th>
                          <th scope="col">Type</th>
                          <th scope="col">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={model().attributes}>
                          {(attribute) => (
                            <tr>
                              <td>
                                <span class={styles.attributeName}>{attribute.name}</span>
                                <Show when={attribute.key}>
                                  <KeyIcon size={13} aria-label="Key" />
                                </Show>
                              </td>
                              <td>
                                <code>{attribute.dataType}</code>
                                <Show when={attribute.optional}>
                                  <span class={styles.qualifier}>optional</span>
                                </Show>
                              </td>
                              <td>
                                <span>{attribute.description}</span>
                                <Show when={attribute.references}>
                                  {(reference) => (
                                    <span class={styles.reference}>
                                      <LinkIcon size={12} aria-hidden="true" />
                                      {reference().model}.{reference().attribute}
                                    </span>
                                  )}
                                </Show>
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </Show>
          </div>
        </Show>
      </Show>
    </Show>
  );
}
