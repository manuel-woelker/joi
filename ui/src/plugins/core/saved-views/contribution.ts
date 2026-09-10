import { extensionPoint } from "../../../base/plugin-registry";
import type { WorkspaceDocument } from "./model";

declare const savedViewDefaultsContributionIdBrand: unique symbol;
export type SavedViewDefaultsContributionId = string & {
  readonly [savedViewDefaultsContributionIdBrand]: "saved-view-defaults-contribution";
};

export function savedViewDefaultsContributionId(value: string): SavedViewDefaultsContributionId {
  if (!value.trim()) throw new Error("Saved-view default contribution IDs must not be empty");
  return value as SavedViewDefaultsContributionId;
}

export interface SavedViewDefaultsContribution {
  readonly id: SavedViewDefaultsContributionId;
  readonly workspace: WorkspaceDocument;
}

export const savedViewDefaults = extensionPoint<SavedViewDefaultsContribution>(
  "saved-view-defaults",
  "Contributes default saved views for an entity domain",
  (contributions) => {
    const ids = new Set<string>();
    for (const contribution of contributions) {
      if (ids.has(contribution.id)) throw new Error(`Saved-view defaults '${contribution.id}' are registered twice`);
      ids.add(contribution.id);
    }
  },
);
