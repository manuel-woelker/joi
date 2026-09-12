import type { IconComponent } from "../../../icons/icon-component";
import type { NavigationSelection } from "../../../base/navigation";
import { extensionPoint } from "../../../base/plugin-registry";
import type { WorkspaceEntryDraft } from "../saved-views/model";

declare const navigationSectionIdBrand: unique symbol;
declare const navigationEntryIdBrand: unique symbol;
export type NavigationSectionId = string & { readonly [navigationSectionIdBrand]: true };
export type NavigationEntryId = string & { readonly [navigationEntryIdBrand]: true };

export const navigationSectionId = (value: string) => value.trim() as NavigationSectionId;
export const navigationEntryId = (value: string) => value.trim() as NavigationEntryId;

export interface NavigationFolderContribution {
  readonly id: NavigationEntryId;
  readonly type: "folder";
  readonly label: string;
  readonly icon?: IconComponent;
  readonly children: readonly NavigationRootContribution[];
}

export interface NavigationLeafContribution {
  readonly id: NavigationEntryId;
  readonly type: "leaf";
  readonly label: string;
  readonly description?: string;
  readonly icon?: IconComponent;
  readonly selection: NavigationSelection;
  readonly copyToWorkspace?: () => WorkspaceEntryDraft;
}

export type NavigationRootContribution = NavigationFolderContribution | NavigationLeafContribution;

export interface NavigationSectionContribution {
  readonly id: NavigationSectionId;
  readonly label: string;
  readonly order: number;
  readonly roots: () => readonly NavigationRootContribution[];
}

export const navigationSection = extensionPoint<NavigationSectionContribution>(
  "navigation-section-trees",
  "Contributes read-only system navigation trees",
  (sections) => {
    const sectionIds = new Set<string>();
    for (const section of sections) {
      if (!section.id || !section.label.trim()) throw new Error("Navigation sections require an ID and label");
      if (!Number.isFinite(section.order)) throw new Error(`Navigation section '${section.id}' has an invalid order`);
      if (sectionIds.has(section.id)) throw new Error(`Navigation section '${section.id}' is registered twice`);
      sectionIds.add(section.id);
    }
  },
);

/** Validates root subtrees after the immutable plugin registry is available. */
export function validateNavigationRoots(sections: readonly NavigationSectionContribution[]): void {
  const visit = (
    entry: NavigationRootContribution,
    entryIds: Set<string>,
    visiting: Set<NavigationRootContribution>,
  ) => {
    if (!entry.id || !entry.label.trim()) throw new Error("Navigation entries require an ID and label");
    if (entryIds.has(entry.id)) throw new Error(`Navigation entry '${entry.id}' is registered twice`);
    entryIds.add(entry.id);
    if (visiting.has(entry)) throw new Error(`Navigation tree contains a cycle at '${entry.id}'`);
    if (entry.type === "folder") {
      visiting.add(entry);
      for (const child of entry.children) visit(child, entryIds, visiting);
      visiting.delete(entry);
    }
  };
  for (const section of sections) {
    const entryIds = new Set<string>();
    for (const root of section.roots()) visit(root, entryIds, new Set());
  }
}
