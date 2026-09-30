import type { FetchService } from "../../../base/services/fetch-service";
import type { LinkCandidate } from "../../../components/rich-text/link-picker";
import { executeDataQuery } from "../query/query-client";
import type { LinkTargetProvider } from "./link-targets";

/** Builds a bounded provider for entities whose public key is a queryable column. */
export function queryLinkProvider(config: {
  readonly service: FetchService;
  readonly type: string;
  readonly label: string;
  readonly table: string;
  readonly key: string;
  readonly title: string;
  readonly href: (key: string, row: { id: string }) => string;
}): LinkTargetProvider {
  const fields = [...new Set([config.key, config.title, "id"])];
  const candidates = async (criterion: Parameters<typeof executeDataQuery>[1]["criterion"], limit: number) => {
    const result = await executeDataQuery(config.service, {
      tableName: config.table,
      criterion,
      attributes: fields,
      sorting: [],
      maxResults: limit,
    });
    const keyColumn = result.requireColumn(config.key);
    const titleColumn = result.requireColumn(config.title);
    const idColumn = result.requireColumn("id");
    return result.rows.map((row): LinkCandidate => {
      const key = String(row.value(keyColumn));
      const label = String(row.value(titleColumn));
      const id = String(row.value(idColumn));
      return { reference: `${config.type}:${key}`, label, description: key, href: config.href(key, { id }) };
    });
  };
  return {
    type: config.type,
    label: config.label,
    async resolve(keys, signal) {
      if (signal.aborted || keys.length === 0) return keys.map(() => undefined);
      const found = await candidates({ equals: { attribute: config.key, values: keys } }, keys.length);
      if (signal.aborted) return keys.map(() => undefined);
      const byKey = new Map(found.map((candidate) => [candidate.reference, candidate]));
      return keys.map((key) => byKey.get(`${config.type}:${key}`));
    },
    async search(query, signal, limit) {
      if (signal.aborted) return [];
      const found = await candidates(
        {
          one: [
            { equals: { attribute: config.key, values: [query] } },
            { term: { value: query, attributes: [config.key, config.title] } },
          ],
        },
        Math.min(limit, 20),
      );
      return signal.aborted ? [] : found;
    },
  };
}
