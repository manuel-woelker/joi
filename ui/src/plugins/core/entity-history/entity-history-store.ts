import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import type { HistoryEntry } from "../../../generated/api/api";
import type { DataChangeService } from "../data-changes/data-change-service";
import type { EntityHistoryService } from "./entity-history-service";

/** Instance-local history state. Only committed changes invalidate pages; drafts do not. */
export function createEntityHistoryStore(
  options: { table: Accessor<string>; recordId: Accessor<string> },
  dependencies: {
    service: Pick<EntityHistoryService, "enabled" | "load">;
    dataChanges: Pick<DataChangeService, "subscribe">;
  },
) {
  const [enabled, setEnabled] = createSignal(false);
  const [tab, setTab] = createSignal("details");
  const [entries, setEntries] = createSignal<readonly HistoryEntry[]>([]);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string>();
  let generation = 0;
  let request = 0;
  let stale = true;
  let capabilityFailed = false;

  const load = async (replace: boolean) => {
    const token = ++request;
    const owner = generation;
    const table = options.table();
    const entityId = options.recordId();
    setLoading(true);
    setError(undefined);
    try {
      const page = await dependencies.service.load({ table, entityId, limit: 50, cursor: replace ? null : cursor() });
      if (token !== request || owner !== generation) return;
      setEnabled(page.enabled);
      setEntries((previous) => (replace ? page.entries : [...previous, ...page.entries]));
      setCursor(page.nextCursor);
      stale = false;
    } catch (cause) {
      if (token === request && owner === generation) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (token === request && owner === generation) setLoading(false);
    }
  };

  const capabilities = async () => {
    const owner = generation;
    setError(undefined);
    capabilityFailed = false;
    try {
      const supported = await dependencies.service.enabled(options.table());
      if (owner !== generation) return;
      setEnabled(supported);
      if (!supported) setTab("details");
      if (supported && tab() === "history") await load(true);
    } catch (cause) {
      if (owner !== generation) return;
      capabilityFailed = true;
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  createEffect(() => {
    const tableName = options.table();
    const recordId = options.recordId();
    generation++;
    request++;
    stale = true;
    setEnabled(false);
    setEntries([]);
    setCursor(null);
    setLoading(false);
    void capabilities();
    const unsubscribe = dependencies.dataChanges.subscribe({ tableName, recordId }, () => {
      stale = true;
      if (enabled() && tab() === "history") void load(true);
    });
    onCleanup(() => {
      unsubscribe();
      generation++;
      request++;
    });
  });

  return {
    enabled,
    tab,
    entries,
    cursor,
    loading,
    error,
    /** Changes presentation without unmounting the edit form. */
    selectTab(value: string) {
      if (value !== "details" && (value !== "history" || !enabled())) return;
      setTab(value);
      if (value === "history" && stale) void load(true);
    },
    /** Retries a failed capability read or refreshes the current entity's first page. */
    retry() {
      if (capabilityFailed) void capabilities();
      else void load(true);
    },
    /** Appends a page without issuing duplicate requests on repeated clicks. */
    loadMore() {
      if (!loading() && cursor()) void load(stale);
    },
  };
}

export type EntityHistoryStore = ReturnType<typeof createEntityHistoryStore>;
