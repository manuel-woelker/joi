import BookOpenIcon from "lucide-solid/icons/book-open";
import KeyIcon from "lucide-solid/icons/key-round";
import LinkIcon from "lucide-solid/icons/link";
import ListIcon from "lucide-solid/icons/list";
import TableIcon from "lucide-solid/icons/table-2";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";

import type { FetchService } from "../../../../base/services/fetch-service";
import { loadModelInfo } from "./model-info-api";
import { ModelText } from "../../../../components/SourceText";
import styles from "./ModelExplorer.module.css";

interface ExplorerAttribute {
  readonly name: string;
  readonly description: string;
  readonly dataType: string;
  readonly key: boolean;
  readonly optional: boolean;
  readonly references?: { readonly model: string; readonly attribute: string } | null;
}

interface ExplorerModel {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly group: string;
  readonly description?: string;
  readonly domain: boolean;
  readonly enumeration: boolean;
  readonly attributes: readonly ExplorerAttribute[];
}

export function ModelExplorer(props: { fetchService: FetchService }) {
  const [response] = createResource(() => loadModelInfo(props.fetchService));
  const [selectedName, setSelectedName] = createSignal<string>();
  const [groupByDomain, setGroupByDomain] = createSignal(true);
  const models = createMemo<readonly ExplorerModel[]>(() => {
    const storage = (response()?.models ?? []).map((model) => ({
      id: `storage:${model.name}`,
      name: model.name,
      source: model.domain ? `${model.domain} storage model` : "Storage model",
      group: model.domain ?? "Storage",
      domain: false,
      enumeration: false,
      attributes: model.attributes,
    }));
    const domains = (response()?.domainModels ?? []).map((model) => ({
      id: model.id,
      name: model.name,
      source: `${model.domain} domain`,
      group: model.domain,
      description: model.description,
      domain: true,
      enumeration: false,
      attributes: model.attributes.map((attribute) => ({ ...attribute, key: false, optional: false })),
    }));
    const enums = (response()?.domainEnums ?? []).map((enumeration) => ({
      id: `${enumeration.id}:enum`,
      name: enumeration.name,
      source: `${enumeration.domain} enum`,
      group: enumeration.domain,
      description: enumeration.description,
      domain: true,
      enumeration: true,
      attributes: enumeration.values.map((value) => ({
        name: value.name,
        description: value.description,
        dataType: "",
        key: false,
        optional: false,
      })),
    }));
    return [...storage, ...domains, ...enums].sort((left, right) => left.name.localeCompare(right.name));
  });
  const selected = createMemo(() => {
    return models().find((model) => model.id === selectedName()) ?? models()[0];
  });
  const modelGroups = createMemo(() => {
    if (!groupByDomain()) return [{ name: "", models: models() }];
    const grouped = new Map<string, ExplorerModel[]>();
    for (const model of models()) {
      const entries = grouped.get(model.group) ?? [];
      entries.push(model);
      grouped.set(model.group, entries);
    }
    return [...grouped]
      .sort(([left], [right]) => {
        if (left === "Storage") return -1;
        if (right === "Storage") return 1;
        return left.localeCompare(right);
      })
      .map(([name, entries]) => ({ name, models: entries }));
  });

  return (
    <Show when={!response.loading} fallback={<p class={styles.message}>Loading application model...</p>}>
      <Show when={!response.error} fallback={<p class={styles.error}>Could not load the application model.</p>}>
        <Show when={models().length} fallback={<p class={styles.message}>No discoverable models.</p>}>
          <div class={styles.explorer}>
            <nav class={styles.modelList} aria-label="Model types">
              <div class={styles.modelControls} role="group" aria-label="Model grouping">
                <button type="button" aria-pressed={!groupByDomain()} onClick={() => setGroupByDomain(false)}>
                  Name
                </button>
                <button type="button" aria-pressed={groupByDomain()} onClick={() => setGroupByDomain(true)}>
                  Domain
                </button>
              </div>
              <div class={styles.modelGroups}>
                <For each={modelGroups()}>
                  {(group) => (
                    <div>
                      <Show when={group.name}>
                        <h3 class={styles.groupHeading}>{group.name}</h3>
                      </Show>
                      <For each={group.models}>
                        {(model) => (
                          <button
                            type="button"
                            class={styles.modelButton}
                            classList={{ [styles.selected]: selected()?.id === model.id }}
                            onClick={() => setSelectedName(model.id)}
                          >
                            {model.enumeration ? (
                              <ListIcon size={16} aria-hidden="true" />
                            ) : model.domain ? (
                              <BookOpenIcon size={16} aria-hidden="true" />
                            ) : (
                              <TableIcon size={16} aria-hidden="true" />
                            )}
                            <span>
                              <ModelText>{model.name}</ModelText>
                            </span>
                            <small>{model.attributes.length}</small>
                          </button>
                        )}
                      </For>
                    </div>
                  )}
                </For>
              </div>
            </nav>
            <Show when={selected()}>
              {(model) => (
                <section class={styles.modelDetail} aria-labelledby="selected-model-name">
                  <header class={styles.modelHeader}>
                    <div>
                      <p>{model().source}</p>
                      <h2 id="selected-model-name">
                        <ModelText>{model().name}</ModelText>
                      </h2>
                      <Show when={model().description}>
                        <p class={styles.description}>{model().description}</p>
                      </Show>
                    </div>
                    <span>
                      {model().attributes.length} {model().enumeration ? "values" : "attributes"}
                    </span>
                  </header>
                  <div class={styles.tableScroller}>
                    <table class={styles.attributeTable} classList={{ [styles.enumTable]: model().enumeration }}>
                      <thead>
                        <tr>
                          <th scope="col">{model().enumeration ? "Value" : "Attribute"}</th>
                          <Show when={!model().enumeration}>
                            <th scope="col">Type</th>
                          </Show>
                          <th scope="col">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={model().attributes}>
                          {(attribute) => (
                            <tr>
                              <td>
                                <span class={styles.attributeName}>
                                  <ModelText>{attribute.name}</ModelText>
                                </span>
                                <Show when={attribute.key}>
                                  <KeyIcon size={13} aria-label="Key" />
                                </Show>
                              </td>
                              <Show when={!model().enumeration}>
                                <td>
                                  <code>
                                    <ModelText>{attribute.dataType}</ModelText>
                                  </code>
                                  <Show when={attribute.optional}>
                                    <span class={styles.qualifier}>optional</span>
                                  </Show>
                                </td>
                              </Show>
                              <td>
                                <span>{attribute.description}</span>
                                <Show when={attribute.references}>
                                  {(reference) => (
                                    <span class={styles.reference}>
                                      <LinkIcon size={12} aria-hidden="true" />
                                      <ModelText>{reference().model}</ModelText>.
                                      <ModelText>{reference().attribute}</ModelText>
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
