import type { QueryValue } from "../query/query-result";
import { serviceKey } from "../plugins/services";

export interface DataChange {
  readonly tableName: string;
  readonly recordId: string;
  readonly changes: Readonly<Record<string, QueryValue>>;
  readonly source?: string;
}

export interface DataChangeFilter {
  readonly tableName: string;
  readonly recordId?: string;
}

export type DataChangeListener = (change: DataChange) => void;

interface Subscription {
  readonly filter: DataChangeFilter;
  readonly listener: DataChangeListener;
}

/** Publishes persisted record changes to explicitly subscribed UI state. */
export class DataChangeService {
  private readonly subscriptions = new Set<Subscription>();

  subscribe(filter: DataChangeFilter, listener: DataChangeListener): () => void {
    const subscription = { filter, listener };
    this.subscriptions.add(subscription);
    return () => this.subscriptions.delete(subscription);
  }

  publish(change: DataChange): void {
    for (const subscription of [...this.subscriptions]) {
      if (!matches(subscription.filter, change)) continue;
      try {
        subscription.listener(change);
      } catch (error) {
        console.error("Data change listener failed", error);
      }
    }
  }
}

function matches(filter: DataChangeFilter, change: DataChange): boolean {
  return (
    filter.tableName === change.tableName && (filter.recordId === undefined || filter.recordId === change.recordId)
  );
}

export const dataChangeServiceKey = serviceKey<DataChangeService>("data-change-service");
