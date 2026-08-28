import { For, Show, createMemo, createResource } from "solid-js";

import { useWorkspace } from "../workspace/controller";
import { executeQuery, validatePresentation } from "../workspace/query";
import type { Ticket } from "../workspace/model";
import { loadTickets } from "../workspace/ticket-api";
import { IconButton } from "./IconButton";

const displayValue = (ticket: Ticket, field: keyof Ticket) => ticket[field];

export function ViewContent() {
  const controller = useWorkspace();
  const [ticketRecords, { refetch }] = createResource(() => loadTickets());
  const query = () => {
    const view = controller.selectedView();
    return view ? controller.workspace.queries[view.queryId] : undefined;
  };
  const presentation = () => {
    const view = controller.selectedView();
    return view ? controller.workspace.presentations[view.presentationId] : undefined;
  };
  const records = createMemo(() => (query() ? executeQuery(ticketRecords() ?? [], query()!, controller.search()) : []));
  const validation = () =>
    query() && presentation() ? validatePresentation(query()!, presentation()!) : "View configuration is incomplete.";

  return (
    <main class="workspace-main">
      <Show
        when={controller.selectedView()}
        fallback={
          <div class="empty-state">
            <h1>No view selected</h1>
            <p>Create or select a saved view from the navigation.</p>
          </div>
        }
      >
        {(view) => (
          <>
            <div class="view-heading">
              <div>
                <p class="eyebrow">Saved view</p>
                <h1>{view().name}</h1>
                <Show when={view().description}>
                  <p>{view().description}</p>
                </Show>
              </div>
              <IconButton label="Configure view" icon="⚙" onClick={() => controller.setEditorOpen(true)} />
            </div>
            <div class="view-toolbar">
              <label class="search-field">
                <span class="icon-glyph" aria-hidden="true">
                  ⌕
                </span>
                <span class="sr-only">Search issues</span>
                <input
                  value={controller.search()}
                  onInput={(event) => controller.setSearch(event.currentTarget.value)}
                  placeholder="Search this view"
                />
              </label>
              <span class="result-count">{ticketRecords.loading ? "Loading" : `${records().length} issues`}</span>
            </div>
            <Show when={!validation()} fallback={<div class="error-state">{validation()}</div>}>
              <Show
                when={!ticketRecords.loading}
                fallback={
                  <div class="empty-state compact">
                    <h2>Loading issues</h2>
                  </div>
                }
              >
                <Show
                  when={!ticketRecords.error}
                  fallback={
                    <div class="error-state">
                      <p>Tickets could not be loaded.</p>
                      <button class="secondary" onClick={() => refetch()}>
                        Retry
                      </button>
                    </div>
                  }
                >
                  <Show
                    when={records().length}
                    fallback={
                      <div class="empty-state compact">
                        <h2>No matching issues</h2>
                        <p>Adjust the search or view query.</p>
                      </div>
                    }
                  >
                    <Show
                      when={presentation()?.layout === "table"}
                      fallback={
                        <div class="issue-list">
                          <For each={records()}>
                            {(ticket) => (
                              <article>
                                <div>
                                  <strong>{ticket.title}</strong>
                                  <span>{ticket.description}</span>
                                </div>
                                <div class="issue-meta">
                                  <span class={`status ${ticket.status}`}>{ticket.status}</span>
                                  <span>{ticket.key}</span>
                                </div>
                              </article>
                            )}
                          </For>
                        </div>
                      }
                    >
                      <div class="table-scroll">
                        <table class={presentation()?.density}>
                          <thead>
                            <tr>
                              <For each={presentation()?.fields}>
                                {(field) => (
                                  <th style={{ width: field.width ? `${field.width}px` : undefined }}>{field.label}</th>
                                )}
                              </For>
                            </tr>
                          </thead>
                          <tbody>
                            <For each={records()}>
                              {(ticket) => (
                                <tr>
                                  <For each={presentation()?.fields}>
                                    {(field) => (
                                      <td>
                                        <Show
                                          when={field.field === "status"}
                                          fallback={displayValue(ticket, field.field)}
                                        >
                                          <span class={`status ${ticket.status}`}>{ticket.status}</span>
                                        </Show>
                                      </td>
                                    )}
                                  </For>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                      </div>
                    </Show>
                  </Show>
                </Show>
              </Show>
            </Show>
          </>
        )}
      </Show>
    </main>
  );
}
