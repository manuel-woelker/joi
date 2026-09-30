import { extensionPoint } from "../../../base/plugin-registry";
import type { LinkCandidate } from "../../../components/rich-text/link-picker";

/** Plugin-owned search and batched resolution for one reference type. */
export interface LinkTargetProvider {
  readonly type: string;
  readonly label: string;
  resolve(keys: readonly string[], signal: AbortSignal): Promise<readonly (LinkCandidate | undefined)[]>;
  search?(query: string, signal: AbortSignal, limit: number): Promise<readonly LinkCandidate[]>;
}

export const linkTargetProviders = extensionPoint<LinkTargetProvider>(
  "link-target-providers",
  "Searches and resolves internal rich-text links",
  (providers) => {
    const types = new Set<string>();
    for (const provider of providers) {
      if (!/^[a-z][a-z0-9-]*$/u.test(provider.type)) throw new Error(`Invalid link type '${provider.type}'`);
      if (types.has(provider.type)) throw new Error(`Link type '${provider.type}' is registered twice`);
      types.add(provider.type);
    }
  },
);
