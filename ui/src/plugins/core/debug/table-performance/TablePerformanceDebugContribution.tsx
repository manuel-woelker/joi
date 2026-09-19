import { createMemo, For, Show } from "solid-js";

import {
  clearTablePerformance,
  type TablePerformanceMetrics,
  tablePerformanceEntries,
} from "../../master-detail/table-performance";
import styles from "./TablePerformanceDebugContribution.module.css";

function formatMs(value: number): string {
  return `${value.toFixed(value < 10 ? 2 : 1)} ms`;
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString();
}

function MetricRow(props: { label: string; value: string }) {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </div>
  );
}

function EntityMetrics(props: { metrics: TablePerformanceMetrics }) {
  const metrics = () => props.metrics;
  return (
    <section aria-label={`${metrics().entityLabel} performance`}>
      <h4>
        {metrics().entityLabel} <span class={styles.tableName}>{metrics().tableName}</span>
      </h4>
      <dl>
        <MetricRow label="Fetch" value={formatMs(metrics().fetchMs)} />
        <MetricRow label="Process" value={formatMs(metrics().processMs)} />
        <MetricRow label="Commit" value={formatMs(metrics().commitMs)} />
        <MetricRow label="Display" value={formatMs(metrics().displayMs)} />
        <MetricRow label="Virtualized" value={metrics().virtualized ? "yes" : "no"} />
        <MetricRow label="Rows" value={`${metrics().rowCount} of ${metrics().totalCount}`} />
        <MetricRow label="Columns" value={String(metrics().columnCount)} />
        <MetricRow label="Measured" value={formatTime(metrics().measuredAt)} />
      </dl>
    </section>
  );
}

export function TablePerformanceDebugContribution() {
  const entries = createMemo(() => Object.values(tablePerformanceEntries()));
  return (
    <div class={styles.content}>
      <Show
        when={entries().length}
        fallback={<p>Nothing measured yet. Open a tickets or other entity table to collect performance metrics.</p>}
      >
        <For each={entries()}>{(metrics) => <EntityMetrics metrics={metrics} />}</For>
        <button type="button" onClick={clearTablePerformance}>
          Clear metrics
        </button>
      </Show>
    </div>
  );
}
