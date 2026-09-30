import { createContext, onCleanup, useContext, type ParentProps } from "solid-js";
import type { PluginRegistryAccess } from "../../../base/plugin-registry";
import type { LinkCandidate, LinkPickerSource, LinkSearchResult } from "../../../components/rich-text/link-picker";
import { safeRichTextHref } from "../../../components/rich-text/safe-rich-text-href";
import { parseLinkReference } from "../../../components/rich-text/link-reference";
import { linkTargetProviders, type LinkTargetProvider } from "./link-targets";
import type { DataChangeService } from "../data-changes/data-change-service";

const MAX_RESULTS = 20;
const MAX_RESOLVE = 100;
const SEARCH_TIMEOUT_MS = 5_000;

/** Session-scoped aggregation and cache for plugin-contributed link providers. */
export class LinkService implements LinkPickerSource {
  private readonly providers: ReadonlyMap<string, LinkTargetProvider>;
  private readonly cache = new Map<string, LinkCandidate>();

  constructor(registry: PluginRegistryAccess) {
    this.providers = new Map(registry.extensions(linkTargetProviders).map((provider) => [provider.type, provider]));
    if (this.providers.size !== registry.extensions(linkTargetProviders).length)
      throw new Error("Link target types must be unique");
  }

  invalidate(): void {
    this.cache.clear();
  }

  async resolve(references: readonly string[], signal: AbortSignal): Promise<readonly (LinkCandidate | undefined)[]> {
    if (references.length > MAX_RESOLVE) throw new Error(`Resolve at most ${MAX_RESOLVE} links at once`);
    const results: (LinkCandidate | undefined)[] = references.map((reference) => this.cache.get(reference));
    const groups = new Map<LinkTargetProvider, { keys: string[]; indexes: number[] }>();
    references.forEach((reference, index) => {
      if (results[index]) return;
      const parsed = parseLinkReference(reference);
      const provider = parsed && this.providers.get(parsed.type);
      if (!provider || !parsed) return;
      const group = groups.get(provider) ?? { keys: [], indexes: [] };
      group.keys.push(parsed.key);
      group.indexes.push(index);
      groups.set(provider, group);
    });
    await Promise.all(
      [...groups].map(async ([provider, group]) => {
        const resolved = await provider.resolve(group.keys, signal);
        if (signal.aborted) return;
        if (resolved.length !== group.keys.length)
          throw new Error(`Link provider '${provider.type}' returned wrong result count`);
        resolved.forEach((entry, offset) => {
          if (!entry) return;
          const reference = references[group.indexes[offset]];
          if (entry.reference !== reference || !safeRichTextHref(entry.href))
            throw new Error(`Link provider '${provider.type}' returned an invalid target`);
          results[group.indexes[offset]] = entry;
          this.cache.set(reference, entry);
        });
      }),
    );
    return results;
  }

  async search(
    query: string,
    signal: AbortSignal,
    onUpdate?: (result: LinkSearchResult) => void,
  ): Promise<LinkSearchResult> {
    const trimmed = query.trim();
    const colon = trimmed.indexOf(":");
    const type = colon > 0 ? trimmed.slice(0, colon) : undefined;
    const providers = type
      ? [this.providers.get(type)].filter((value): value is LinkTargetProvider => !!value)
      : [...this.providers.values()];
    const term = type ? trimmed.slice(colon + 1) : trimmed;
    if (!term.trim()) return { entries: [], errors: [] };
    const searchable = providers.filter((provider) => provider.search);
    const completed = new Map<number, readonly LinkCandidate[]>();
    const failures = new Map<number, string>();
    const snapshot = (): LinkSearchResult => ({
      entries: searchable.flatMap((_, index) => completed.get(index) ?? []).slice(0, MAX_RESULTS),
      errors: searchable.flatMap((_, index) => failures.get(index) ?? []),
    });
    let next = 0;
    const worker = async () => {
      while (next < searchable.length && !signal.aborted) {
        const index = next++;
        const provider = searchable[index];
        try {
          const found = await searchWithTimeout(provider, term, signal);
          completed.set(
            index,
            found.filter(
              (entry) => parseLinkReference(entry.reference)?.type === provider.type && safeRichTextHref(entry.href),
            ),
          );
        } catch (error) {
          if (!signal.aborted)
            failures.set(index, `${provider.label}: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!signal.aborted) onUpdate?.(snapshot());
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, searchable.length) }, worker));
    return signal.aborted ? { entries: [], errors: [] } : snapshot();
  }
}

function searchWithTimeout(
  provider: LinkTargetProvider,
  query: string,
  signal: AbortSignal,
): Promise<readonly LinkCandidate[]> {
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      controller.abort();
      finish();
      reject(new Error("Search cancelled"));
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish();
      reject(new Error("Search timed out"));
    }, SEARCH_TIMEOUT_MS);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    Promise.resolve()
      .then(() => provider.search!(query, controller.signal, MAX_RESULTS))
      .then(
        (entries) => {
          finish();
          resolve(entries);
        },
        (error: unknown) => {
          finish();
          reject(error);
        },
      );
  });
}

const LinkContext = createContext<LinkService>();

export function LinkProvider(props: ParentProps<{ registry: PluginRegistryAccess; dataChanges?: DataChangeService }>) {
  const service = new LinkService(props.registry);
  const unsubscribe = ["tickets", "users", "wikipages", "entity_keys", "repositories", "codevette_commits"].map(
    (tableName) => props.dataChanges?.subscribe({ tableName }, () => service.invalidate()),
  );
  onCleanup(() => unsubscribe.forEach((stop) => stop?.()));
  return <LinkContext.Provider value={service}>{props.children}</LinkContext.Provider>;
}

export function useOptionalLinkService(): LinkService | undefined {
  return useContext(LinkContext);
}
