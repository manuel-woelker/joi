// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createNavigationController, NavigationProvider } from "../../../base/navigation";
import type { PluginRegistryAccess } from "../../../base/plugin-registry";
import { ApplicationServicesProvider } from "../../../base/services/application-services";
import { type Fetcher, FetchService } from "../../../base/services/fetch-service";
import { ContextMenuProvider } from "../../../components/context-menu/ContextMenuProvider";
import { ActionProvider } from "../actions/ActionProvider";
import { DataChangeService } from "../data-changes/data-change-service";
import { RecordMutationService } from "../data-changes/record-mutation-service";
import { type EntityDescription, entityId } from "../entities/entity-description";
import { EntityRegistryProvider, entityDescriptions } from "../entities/entity-registry";
import { LookupProvider } from "../lookups/lookup";
import { EntityMasterDetailView } from "./EntityMasterDetailView";

afterEach(cleanup);

const ticketEntity: EntityDescription = {
  id: entityId("ticket"),
  tableName: "tickets",
  label: "Ticket",
  pluralLabel: "Tickets",
  icon: () => <span aria-hidden="true" />,
  identityAttribute: "id",
  attributes: [
    { id: "id", label: "ID", valueType: "string", table: { visibleByDefault: true } },
    { id: "name", label: "Name", valueType: "string", table: { visibleByDefault: true } },
  ],
};

function rowsResponse(ids: readonly string[]) {
  return {
    results: [
      {
        type: "rows",
        result_columns: [
          { attribute: "id", values: { type: "string", values: [...ids] } },
          { attribute: "name", values: { type: "string", values: ids.map((id) => `Name ${id}`) } },
        ],
      },
    ],
  };
}

function countResponse(count: number) {
  return {
    results: [{ type: "aggregate", aggregation: "count", values: [{ value: null, count }] }],
  };
}

function renderView(fetcher: Fetcher) {
  const fetchService = new FetchService(fetcher);
  const dataChanges = new DataChangeService();
  const registry = {
    extensions: (point: unknown) => (point === entityDescriptions ? [ticketEntity] : []),
    extensionEntries: () => [],
  } as unknown as PluginRegistryAccess;
  render(() => (
    <NavigationProvider controller={createNavigationController()}>
      <ApplicationServicesProvider
        services={{ dataChanges, fetchService, recordMutations: new RecordMutationService(fetchService, dataChanges) }}
      >
        <ContextMenuProvider>
          <LookupProvider registry={registry}>
            <EntityRegistryProvider pluginRegistry={registry}>
              <ActionProvider registry={registry} currentUser={{ id: "user-1", username: "jane", name: "Jane" }}>
                <EntityMasterDetailView entityId={entityId("ticket")} />
              </ActionProvider>
            </EntityRegistryProvider>
          </LookupProvider>
        </ContextMenuProvider>
      </ApplicationServicesProvider>
    </NavigationProvider>
  ));
}

describe("EntityMasterDetailView master table", () => {
  it("renders the table shell while the first page loads", async () => {
    let resolveRows!: (response: Response) => void;
    const fetcher: Fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        results?: readonly [{ type?: string }];
      };
      if (body.results?.[0]?.type === "rows") {
        // Hold the rows open so the loading state stays observable.
        return new Promise<Response>((resolve) => {
          resolveRows = resolve;
        });
      }
      return { ok: true, json: async () => countResponse(2) } as Response;
    });
    renderView(fetcher);

    // Headers and the tbody render from the first paint, so the viewport
    // can be measured before any records arrive.
    expect(await screen.findByRole("columnheader", { name: "ID" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Tickets" }).querySelector("tbody")).toBeTruthy();
    expect(screen.queryByText("Name a")).toBeNull();

    resolveRows({ ok: true, json: async () => rowsResponse(["a", "b"]) } as Response);
    expect(await screen.findByText("Name a")).toBeDefined();
  });

  it("sends the quicksearch term after debouncing", async () => {
    const criteria: unknown[] = [];
    const fetcher: Fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        criterion?: unknown;
        results?: readonly [{ type?: string }];
      };
      if (body.results?.[0]?.type === "rows") {
        criteria.push(body.criterion);
        return { ok: true, json: async () => rowsResponse(["a"]) } as Response;
      }
      return { ok: true, json: async () => countResponse(1) } as Response;
    });
    renderView(fetcher);

    expect(await screen.findByText("Name a")).toBeDefined();
    expect(criteria[0]).toBe("match_any");

    await userEvent.type(screen.getByRole("searchbox", { name: "Search tickets" }), "name a");
    await waitFor(() => {
      if (!criteria.some((criterion) => JSON.stringify(criterion).includes('"term"'))) {
        throw new Error("quicksearch term not sent yet");
      }
    });
    expect(criteria.at(-1)).toEqual({ term: { value: "name a" } });
    expect(screen.getByText("Name", { selector: "mark" })).toBeTruthy();
  });

  it("survives sort, reverse, and reset cycles with fresh results", async () => {
    const fetcher: Fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        results?: readonly [{ type?: string; sorting?: readonly [{ attribute: string; direction: string }] }];
      };
      if (body.results?.[0]?.type === "rows") {
        const sorting = body.results[0].sorting ?? [];
        const ids = ["a", "b"];
        const nameSort = sorting.find((sort) => sort.attribute === "name");
        if (nameSort?.direction === "ascending") ids.reverse();
        return { ok: true, json: async () => rowsResponse(ids) } as Response;
      }
      return { ok: true, json: async () => countResponse(2) } as Response;
    });
    renderView(fetcher);

    expect(await screen.findByText("Name a")).toBeDefined();
    const sortButton = () => screen.getByRole("button", { name: /^(Sort by Name|Name, )/ });

    await userEvent.click(sortButton());
    expect(await screen.findByText("Name b")).toBeDefined();

    await userEvent.click(sortButton());
    expect(await screen.findByText("Name a")).toBeDefined();

    await userEvent.click(sortButton());
    expect(await screen.findByText("Name a")).toBeDefined();
    expect(screen.getByRole("button", { name: "Sort by Name" })).toBeDefined();
  });

  it("survives resort cycles when rows are virtualized", async () => {
    // A fixed viewport height engages the virtualized table path, where the
    // visible window must refresh on data changes even though its indices
    // stay the same. Each load parses fresh results, so rows and columns
    // from different loads must never meet in one cell.
    const callbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback);
        }
        observe(target: Element) {
          // Resolve asynchronously like a real ResizeObserver instead of
          // re-entering the render phase from the ref callback.
          const self = this as unknown as ResizeObserver;
          queueMicrotask(() => {
            for (const callback of callbacks) {
              callback([{ target, contentRect: { height: 300 } } as ResizeObserverEntry], self);
            }
          });
        }
        unobserve() {}
        disconnect() {}
      },
    );
    const heights = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.style.maxHeight === "300px" ? 300 : 33;
    });
    try {
      const ids = Array.from({ length: 50 }, (_, index) => `id-${index}`);
      const fetcher: Fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          results?: readonly [{ type?: string; sorting?: readonly [{ attribute: string; direction: string }] }];
        };
        if (body.results?.[0]?.type === "rows") {
          const sorting = body.results[0].sorting ?? [];
          const ordered = [...ids];
          const nameSort = sorting.find((sort) => sort.attribute === "name");
          if (nameSort?.direction === "ascending") ordered.reverse();
          return { ok: true, json: async () => rowsResponse(ordered) } as Response;
        }
        return { ok: true, json: async () => countResponse(ids.length) } as Response;
      });
      renderView(fetcher);

      const firstDataRowText = () => screen.queryAllByRole("row")[1]?.textContent ?? "";
      const expectFirstRow = async (id: string, stage: string) => {
        await waitFor(() => {
          if (!firstDataRowText().includes(id)) throw new Error(`${stage} rows not rendered yet`);
        });
      };
      await expectFirstRow("id-0", "initial");
      const sortButton = () => screen.getByRole("button", { name: /^(Sort by Name|Name, )/ });

      await userEvent.click(sortButton());
      await expectFirstRow("id-49", "ascending");

      await userEvent.click(sortButton());
      await expectFirstRow("id-0", "descending");

      await userEvent.click(sortButton());
      await expectFirstRow("id-0", "reset");
      expect(screen.getByRole("button", { name: "Sort by Name" })).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
      heights.mockRestore();
    }
  });
});
