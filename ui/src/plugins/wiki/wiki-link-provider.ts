import type { FetchService } from "../../base/services/fetch-service";
import type { LinkCandidate } from "../../components/rich-text/link-picker";
import { executeDataQuery } from "../core/query/query-client";
import type { LinkTargetProvider } from "../core/links/link-targets";

/** Resolves only registered wiki aliases; links never silently change targets. */
export function wikiLinkProvider(service: FetchService): LinkTargetProvider {
  const alias = (key: string): LinkCandidate => ({
    reference: `wiki:${key}`,
    label: key,
    href: `#:wiki:${encodeURIComponent(key)}`,
  });
  const page = (id: string, title: string): LinkCandidate => ({
    reference: `wiki:${id}`,
    label: title,
    href: `#/entity?entity=${encodeURIComponent(`wikipages:${id}`)}`,
  });
  return {
    type: "wiki",
    label: "Wiki page",
    async resolve(keys, signal) {
      if (!keys.length || signal.aborted) return keys.map(() => undefined);
      const result = await executeDataQuery(service, {
        tableName: "entity_keys",
        criterion: { equals: { attribute: "id", values: keys.map((key) => `wiki:${key}`) } },
        attributes: ["id", "entity_type"],
        sorting: [],
        maxResults: keys.length,
      });
      if (signal.aborted) return keys.map(() => undefined);
      const ids = result.requireColumn("id");
      const types = result.requireColumn("entity_type");
      const found = new Set(result.rows.filter((row) => row.value(types) === "wikipages").map((row) => row.value(ids)));
      const missing = keys.filter((key) => !found.has(`wiki:${key}`));
      if (!missing.length) return keys.map((key) => alias(key));
      const pages = await executeDataQuery(service, {
        tableName: "wikipages",
        criterion: { equals: { attribute: "id", values: missing } },
        attributes: ["id", "title"],
        sorting: [],
        maxResults: missing.length,
      });
      if (signal.aborted) return keys.map(() => undefined);
      const id = pages.requireColumn("id");
      const title = pages.requireColumn("title");
      const byId = new Map(pages.rows.map((row) => [String(row.value(id)), String(row.value(title))]));
      return keys.map((key) =>
        found.has(`wiki:${key}`) ? alias(key) : byId.has(key) ? page(key, byId.get(key)!) : undefined,
      );
    },
    async search(query, signal, limit) {
      if (signal.aborted) return [];
      const result = await executeDataQuery(service, {
        tableName: "wikipages",
        criterion: { term: { value: query, attributes: ["title"] } },
        attributes: ["id", "title"],
        sorting: [],
        maxResults: Math.min(limit, 20),
      });
      if (signal.aborted) return [];
      const ids = result.requireColumn("id");
      const titles = result.requireColumn("title");
      const pages = result.rows.map((row) => ({ id: String(row.value(ids)), title: String(row.value(titles)) }));
      if (!pages.length) return [];
      const aliases = await executeDataQuery(service, {
        tableName: "entity_keys",
        criterion: { equals: { attribute: "entity_id", values: pages.map((item) => item.id) } },
        attributes: ["id", "entity_id", "entity_type"],
        sorting: [],
        maxResults: pages.length * 4,
      });
      if (signal.aborted) return [];
      const aliasId = aliases.requireColumn("id");
      const entityId = aliases.requireColumn("entity_id");
      const entityType = aliases.requireColumn("entity_type");
      const byId = new Map(
        aliases.rows.flatMap((row): [string, string][] => {
          const key = String(row.value(aliasId));
          return key.startsWith("wiki:") && row.value(entityType) === "wikipages"
            ? [[String(row.value(entityId)), key.slice("wiki:".length)]]
            : [];
        }),
      );
      return pages.map((item) => {
        const key = byId.get(item.id);
        return key ? { ...alias(key), label: item.title } : page(item.id, item.title);
      });
    },
  };
}
