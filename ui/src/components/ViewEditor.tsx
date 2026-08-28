import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

import { useWorkspace } from "../workspace/controller";
import type { PresentationDefinition, QueryDefinition, TicketStatus } from "../workspace/model";
import { cloneValue } from "../workspace/operations";
import { validatePresentation } from "../workspace/query";
import { IconButton } from "./IconButton";

export function ViewEditor() {
  const controller = useWorkspace();
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [query, setQuery] = createSignal<QueryDefinition>();
  const [presentation, setPresentation] = createSignal<PresentationDefinition>();
  const [mode, setMode] = createSignal<"update" | "copy">("copy");

  createEffect(() => {
    if (!controller.editorOpen()) return;
    const view = controller.selectedView();
    if (!view) return;
    setName(view.name);
    setDescription(view.description ?? "");
    setQuery(cloneValue(controller.workspace.queries[view.queryId]));
    setPresentation(cloneValue(controller.workspace.presentations[view.presentationId]));
    const queryUse = Object.values(controller.workspace.views).filter((item) => item.queryId === view.queryId).length;
    const presentationUse = Object.values(controller.workspace.views).filter(
      (item) => item.presentationId === view.presentationId,
    ).length;
    setMode(queryUse > 1 || presentationUse > 1 ? "copy" : "update");
  });

  const queryReferences = createMemo(() =>
    query() ? Object.values(controller.workspace.views).filter((view) => view.queryId === query()!.id).length : 0,
  );
  const presentationReferences = createMemo(() =>
    presentation()
      ? Object.values(controller.workspace.views).filter((view) => view.presentationId === presentation()!.id).length
      : 0,
  );
  const error = () =>
    query() && presentation() ? validatePresentation(query()!, presentation()!) : "Choose a query and presentation.";
  const activeStatuses = () => {
    const filter = query()?.filters.find((item) => item.field === "status" && item.operator === "in");
    return new Set(Array.isArray(filter?.value) ? filter.value : []);
  };
  const toggleStatus = (status: TicketStatus) => {
    const current = query();
    if (!current) return;
    const statuses = activeStatuses();
    statuses.has(status) ? statuses.delete(status) : statuses.add(status);
    const filters = current.filters.filter((item) => !(item.field === "status" && item.operator === "in"));
    if (statuses.size) filters.push({ field: "status", operator: "in", value: [...statuses] });
    setQuery({ ...current, filters });
  };

  return (
    <Show when={controller.editorOpen()}>
      <div class="panel-backdrop" onClick={() => controller.setEditorOpen(false)} />
      <aside class="editor-panel" aria-label="Configure view">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Configuration</p>
            <h2>Edit view</h2>
          </div>
          <IconButton label="Close editor" icon="×" onClick={() => controller.setEditorOpen(false)} />
        </div>
        <div class="editor-content">
          <section>
            <h3>View</h3>
            <label>
              Name
              <input value={name()} onInput={(event) => setName(event.currentTarget.value)} />
            </label>
            <label>
              Description
              <textarea rows="2" value={description()} onInput={(event) => setDescription(event.currentTarget.value)} />
            </label>
          </section>
          <section>
            <div class="section-heading">
              <h3>Query</h3>
              <span>
                {queryReferences()} view{queryReferences() === 1 ? "" : "s"}
              </span>
            </div>
            <label>
              Definition
              <select
                value={query()?.id}
                onChange={(event) => setQuery(cloneValue(controller.workspace.queries[event.currentTarget.value]))}
              >
                <For each={Object.values(controller.workspace.queries)}>
                  {(item) => <option value={item.id}>{item.name}</option>}
                </For>
              </select>
            </label>
            <label>
              Name
              <input
                value={query()?.name ?? ""}
                onInput={(event) => query() && setQuery({ ...query()!, name: event.currentTarget.value })}
              />
            </label>
            <fieldset>
              <legend>Status filter</legend>
              <div class="check-grid">
                <For each={["open", "in-progress", "closed"] as TicketStatus[]}>
                  {(status) => (
                    <label>
                      <input
                        type="checkbox"
                        checked={activeStatuses().has(status)}
                        onChange={() => toggleStatus(status)}
                      />
                      {status}
                    </label>
                  )}
                </For>
              </div>
            </fieldset>
          </section>
          <section>
            <div class="section-heading">
              <h3>Presentation</h3>
              <span>
                {presentationReferences()} view{presentationReferences() === 1 ? "" : "s"}
              </span>
            </div>
            <label>
              Definition
              <select
                value={presentation()?.id}
                onChange={(event) =>
                  setPresentation(cloneValue(controller.workspace.presentations[event.currentTarget.value]))
                }
              >
                <For each={Object.values(controller.workspace.presentations)}>
                  {(item) => <option value={item.id}>{item.name}</option>}
                </For>
              </select>
            </label>
            <label>
              Name
              <input
                value={presentation()?.name ?? ""}
                onInput={(event) =>
                  presentation() && setPresentation({ ...presentation()!, name: event.currentTarget.value })
                }
              />
            </label>
            <div class="segmented" aria-label="Layout">
              <button
                class={presentation()?.layout === "table" ? "active" : ""}
                onClick={() => presentation() && setPresentation({ ...presentation()!, layout: "table" })}
              >
                Table
              </button>
              <button
                class={presentation()?.layout === "list" ? "active" : ""}
                onClick={() => presentation() && setPresentation({ ...presentation()!, layout: "list" })}
              >
                List
              </button>
            </div>
            <label>
              Density
              <select
                value={presentation()?.density}
                onChange={(event) =>
                  presentation() &&
                  setPresentation({
                    ...presentation()!,
                    density: event.currentTarget.value as PresentationDefinition["density"],
                  })
                }
              >
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
              </select>
            </label>
          </section>
          <section>
            <h3>Save behavior</h3>
            <label class="radio-row">
              <input type="radio" name="mode" checked={mode() === "copy"} onChange={() => setMode("copy")} />
              <span>
                <strong>Save as private copy</strong>
                <small>Only this view changes.</small>
              </span>
            </label>
            <label class="radio-row">
              <input type="radio" name="mode" checked={mode() === "update"} onChange={() => setMode("update")} />
              <span>
                <strong>Update definitions</strong>
                <small>Changes every referencing view.</small>
              </span>
            </label>
          </section>
          <Show when={error()}>
            <p class="form-error">{error()}</p>
          </Show>
        </div>
        <div class="editor-actions">
          <button class="secondary" onClick={() => controller.setEditorOpen(false)}>
            Cancel
          </button>
          <button
            class="primary"
            disabled={!name().trim() || !!error()}
            onClick={() => controller.saveView(name().trim(), description().trim(), query()!, presentation()!, mode())}
          >
            Save view
          </button>
        </div>
      </aside>
    </Show>
  );
}
