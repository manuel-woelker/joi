// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createNavigationController, NavigationProvider } from "../../../base/navigation";
import type { PluginRegistryAccess } from "../../../base/plugin-registry";
import { ApplicationServicesProvider } from "../../../base/services/application-services";
import { type Fetcher, FetchService } from "../../../base/services/fetch-service";
import { ContextMenuProvider } from "../../../components/context-menu/ContextMenuProvider";
import {
  createCompositeFilter,
  createFilterCriterion,
  filterAttributeId,
  filterOperatorId,
} from "../../../components/filter-definition/filter-model";
import type { FilterDefinition } from "../../../components/filter-definition/filter-model";
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
    { id: "name", label: "Name", valueType: "string", table: { visibleByDefault: true }, facet: true },
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

function renderView(fetcher: Fetcher, initialFilter?: FilterDefinition) {
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
                <EntityMasterDetailView entityId={entityId("ticket")} initialFilter={initialFilter} />
              </ActionProvider>
            </EntityRegistryProvider>
          </LookupProvider>
        </ContextMenuProvider>
      </ApplicationServicesProvider>
    </NavigationProvider>
  ));
}

describe("EntityMasterDetailView master table", () => {
  it("marks the filter and facet buttons only while their restrictions are active", async () => {
    const fetcher: Fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { results?: readonly [{ type?: string }] };
      return {
        ok: true,
        json: async () => (body.results?.[0]?.type === "rows" ? rowsResponse(["a"]) : countResponse(1)),
      } as Response;
    });
    renderView(
      fetcher,
      createCompositeFilter("all", [createFilterCriterion(filterAttributeId("name"), filterOperatorId("set"))]),
    );
    expect(await screen.findByText("Name a")).toBeDefined();
    const filterButton = screen.getByRole("button", { name: "Filter tickets" });
    const facetButton = screen.getByRole("button", { name: "Show tickets facets" });
    expect(filterButton.hasAttribute("data-restricted")).toBe(true);
    expect(facetButton.hasAttribute("data-restricted")).toBe(false);

    fireEvent.mouseEnter(filterButton.parentElement!);
    expect((await screen.findByRole("tooltip")).textContent).toContain("Name is set");
    fireEvent.mouseLeave(filterButton.parentElement!);

    fireEvent.contextMenu(screen.getByText("Name a"));
    fireEvent.click(await screen.findByRole("menuitem", { name: 'Include "Name a"' }));
    expect(facetButton.hasAttribute("data-restricted")).toBe(true);
    fireEvent.mouseEnter(facetButton.parentElement!);
    expect((await screen.findByRole("tooltip")).textContent).toContain('Name: Include "Name a"');
    fireEvent.mouseLeave(facetButton.parentElement!);
    fireEvent.contextMenu(screen.getByRole("columnheader", { name: "Name" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear filters and facets" }));
    expect(filterButton.hasAttribute("data-restricted")).toBe(false);
    expect(facetButton.hasAttribute("data-restricted")).toBe(false);
  });

  it("clears a column quickfilter from its header menu", async () => {
    const fetcher: Fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { results?: readonly [{ type?: string }] };
      return {
        ok: true,
        json: async () => (body.results?.[0]?.type === "rows" ? rowsResponse(["a"]) : countResponse(1)),
      } as Response;
    });
    renderView(fetcher);
    expect(await screen.findByText("Name a")).toBeDefined();
    fireEvent.contextMenu(screen.getByRole("columnheader", { name: "Name" }));
    expect(screen.getByRole("menuitem", { name: "Clear filters and facets" }).hasAttribute("disabled")).toBe(true);
    await userEvent.keyboard("{Escape}");

    await userEvent.type(screen.getByRole("searchbox", { name: "Filter Name" }), "Jane");
    fireEvent.contextMenu(screen.getByRole("columnheader", { name: "Name" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear filters and facets" }));
    expect((screen.getByRole("searchbox", { name: "Filter Name" }) as HTMLInputElement).value).toBe("");
  });

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

  it("sends column terms scoped to their attribute", async () => {
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

    await userEvent.type(screen.getByRole("searchbox", { name: "Filter Name" }), "name b");
    await waitFor(() => {
      if (!criteria.some((criterion) => JSON.stringify(criterion).includes('"attributes"'))) {
        throw new Error("column term not sent yet");
      }
    });
    expect(criteria.at(-1)).toEqual({ term: { value: "name b", attributes: ["name"] } });
    expect(screen.getByText("Name", { selector: "mark" })).toBeTruthy();
  });

  it("keeps focus in the column input across searches", async () => {
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
    const settled = criteria.length;
    const input = screen.getByRole("searchbox", { name: "Filter Name" });
    await userEvent.click(input);
    await userEvent.keyboard("x");
    const afterFirst = screen.getByRole("searchbox", { name: "Filter Name" });
    expect(afterFirst).toBe(input);
    await userEvent.keyboard("yz");
    await waitFor(() => {
      if (criteria.length <= settled) throw new Error("search not committed yet");
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Filter Name" }));
    });
  });

  it("keeps editing state while a search is in flight", async () => {
    let resolveRows!: (response: Response) => void;
    const fetcher: Fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        results?: readonly [{ type?: string }];
      };
      if (body.results?.[0]?.type === "rows") {
        return new Promise<Response>((resolve) => {
          resolveRows = resolve;
        });
      }
      return { ok: true, json: async () => countResponse(1) } as Response;
    });
    renderView(fetcher);

    resolveRows({ ok: true, json: async () => rowsResponse(["a"]) } as Response);
    expect(await screen.findByText("Name a")).toBeDefined();
    const input = screen.getByRole("searchbox", { name: "Filter Name" });
    await userEvent.click(input);
    await userEvent.keyboard("x");
    // Commit fires while the rows request is still open; keep typing through it.
    await new Promise((resolve) => setTimeout(resolve, 350));
    const midFlight = screen.getByRole("searchbox", { name: "Filter Name" });
    expect(midFlight).toBe(input);
    expect(document.activeElement).toBe(input);
    await userEvent.keyboard("y");
    resolveRows({ ok: true, json: async () => rowsResponse(["a"]) } as Response);
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Filter Name" }));
    });
    expect((screen.getByRole("searchbox", { name: "Filter Name" }) as HTMLInputElement).value).toBe("xy");
  });

  it("labels toolbar buttons with refresh before create", async () => {
    const fetcher: Fetcher = vi.fn(async () => {
      return { ok: true, json: async () => countResponse(0) } as Response;
    });
    renderView(fetcher);
    await screen.findByRole("table", { name: "Tickets" });

    const filter = screen.getByRole("button", { name: "Filter tickets" });
    const facets = screen.getByRole("button", { name: "Show tickets facets" });
    const refresh = screen.getByRole("button", { name: "Refresh tickets" });
    const create = screen.getByRole("button", { name: "New ticket" });
    expect(filter.textContent).toContain("Filter");
    expect(facets.textContent).toContain("Facets");
    expect(refresh.textContent).toContain("Refresh");
    expect(create.textContent).toContain("New ticket");
    const order = [filter, facets, refresh, create].map((button) =>
      Array.prototype.indexOf.call(button.parentElement!.children, button),
    );
    expect(order).toEqual([...order].sort((left, right) => left - right));
  });

  it("offers cell include and exclude actions feeding the facet filter", async () => {
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
    fireEvent.contextMenu(screen.getByText("Name a"));
    fireEvent.click(await screen.findByRole("menuitem", { name: 'Include "Name a"' }));
    await waitFor(() => {
      if (!criteria.some((criterion) => JSON.stringify(criterion).includes("Name a"))) {
        throw new Error("facet selection not applied yet");
      }
    });
    expect(criteria.at(-1)).toEqual({ equals: { attribute: "name", values: ["Name a"] } });
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

      const firstDataRowText = () =>
        screen.getByRole("table", { name: "Tickets" }).querySelectorAll("tr[data-row-id]")[0]?.textContent ?? "";
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
