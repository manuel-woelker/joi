import type { FetchService } from "../../base/services/fetch-service";
import type { LinkCandidate } from "../../components/rich-text/link-picker";
import { executeDataQuery } from "../core/query/query-client";
import type { LinkTargetProvider } from "../core/links/link-targets";

/** Resolves cached review commits using repository keys, never branch identities. */
export function commitLinkProvider(service: FetchService): LinkTargetProvider {
  const repositories = async (ids?: readonly string[]) => {
    const result = await executeDataQuery(service, {
      tableName: "repositories",
      criterion: ids ? { equals: { attribute: "id", values: ids } } : "match_any",
      attributes: ["id", "key"],
      sorting: [],
      maxResults: ids?.length ?? 1000,
    });
    const id = result.requireColumn("id");
    const key = result.requireColumn("key");
    return new Map(result.rows.map((row) => [String(row.value(id)), String(row.value(key))]));
  };
  const candidates = async (criterion: Parameters<typeof executeDataQuery>[1]["criterion"], limit: number) => {
    const result = await executeDataQuery(service, {
      tableName: "codevette_commits",
      criterion,
      attributes: ["commit_id", "repository_id", "message"],
      sorting: [],
      maxResults: limit,
    });
    const sha = result.requireColumn("commit_id");
    const repo = result.requireColumn("repository_id");
    const message = result.requireColumn("message");
    const rows = result.rows.map((row) => ({
      sha: String(row.value(sha)),
      repo: String(row.value(repo)),
      message: String(row.value(message)),
    }));
    const byId = await repositories([...new Set(rows.map((row) => row.repo))]);
    return rows.flatMap((row): LinkCandidate[] => {
      const key = byId.get(row.repo);
      if (!key) return [];
      const reference = `commit:${key}@${row.sha}`;
      return [
        {
          reference,
          label: row.message.split("\n", 1)[0] || row.sha.slice(0, 8),
          description: `${key} ${row.sha.slice(0, 8)}`,
          href: `#/codevette/codevette-link/${encodeURIComponent(`${key}@${row.sha}`)}`,
        },
      ];
    });
  };
  return {
    type: "commit",
    label: "Commit",
    async resolve(keys, signal) {
      const shas = keys
        .map((key) => key.slice(key.lastIndexOf("@") + 1))
        .filter((sha) => /^[a-f0-9]{40,64}$/u.test(sha));
      if (!shas.length || signal.aborted) return keys.map(() => undefined);
      const found = await candidates({ equals: { attribute: "commit_id", values: shas } }, Math.min(shas.length, 100));
      if (signal.aborted) return keys.map(() => undefined);
      const byReference = new Map(found.map((entry) => [entry.reference, entry]));
      return keys.map((key) => byReference.get(`commit:${key}`));
    },
    async search(query, signal, limit) {
      if (signal.aborted) return [];
      const found = await candidates(
        {
          one: [
            { equals: { attribute: "commit_id", values: [query] } },
            { term: { value: query, attributes: ["commit_id", "message"] } },
          ],
        },
        Math.min(limit, 20),
      );
      return signal.aborted ? [] : found;
    },
  };
}
