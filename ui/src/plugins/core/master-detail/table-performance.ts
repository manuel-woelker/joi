import { createStore, reconcile } from "solid-js/store";

/** Timing and size metrics for one entity table load. */
export interface TablePerformanceMetrics {
  /** Entity identifier, for example "ticket". */
  readonly entityId: string;
  /** Human-readable entity label. */
  readonly entityLabel: string;
  /** Backing table name. */
  readonly tableName: string;
  /** Wall time of the record fetch, in milliseconds. */
  readonly fetchMs: number;
  /** Wall time of deriving display state from the result, in milliseconds. */
  readonly processMs: number;
  /** Time from settled data to the painted frame, in milliseconds. */
  readonly displayMs: number;
  /** Rows returned by the fetch. */
  readonly rowCount: number;
  /** Total matching rows reported by the count query. */
  readonly totalCount: number;
  /** Columns in the fetched result. */
  readonly columnCount: number;
  /** Unix timestamp of the measurement. */
  readonly measuredAt: number;
}

const [entries, setEntries] = createStore<Record<string, TablePerformanceMetrics>>({});

/** Reactive map of the latest metrics per entity, keyed by entity ID. */
export function tablePerformanceEntries(): Record<string, TablePerformanceMetrics> {
  return entries;
}

/** Records the latest metrics for one entity table load. */
export function recordTablePerformance(metrics: TablePerformanceMetrics): void {
  setEntries(metrics.entityId, metrics);
}

/** Clears all recorded metrics, primarily for tests. */
export function clearTablePerformance(): void {
  setEntries(reconcile({}));
}
