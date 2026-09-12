import type { NavigationSelection } from "../../../base/navigation";
import type { NavigationEntryId, NavigationLeafContribution, NavigationRootContribution } from "./contribution";
import type { ViewId, WorkspaceDocument } from "../saved-views/model";

export type RecentViewReference =
  | { readonly type: "workspace"; readonly viewId: ViewId }
  | { readonly type: "system"; readonly section: string; readonly entryId: NavigationEntryId };

export function leafEntries(roots: readonly NavigationRootContribution[]): NavigationLeafContribution[] {
  return roots.flatMap((entry) => (entry.type === "leaf" ? [entry] : leafEntries(entry.children)));
}

export function selectionOwner(selection: NavigationSelection): NavigationSelection {
  return selection.type === "record" || selection.type === "create" ? selection.owner : selection;
}

export function sameSelection(left: NavigationSelection, right: NavigationSelection): boolean {
  const a = selectionOwner(left);
  const b = selectionOwner(right);
  return (a.type === "view" || a.type === "administration") && a.type === b.type && "id" in b && a.id === b.id;
}

export function referenceForSelection(
  selection: NavigationSelection,
  systemLeaves: readonly NavigationLeafContribution[],
  workspace: WorkspaceDocument,
): RecentViewReference | undefined {
  const owner = selectionOwner(selection);
  if (owner.type !== "view" && owner.type !== "administration") return undefined;
  if ((!owner.route || owner.route.section === "workspace") && owner.type === "view" && workspace.views[owner.id]) {
    return { type: "workspace", viewId: owner.id };
  }
  const system = owner.route && systemLeaves.find((entry) => entry.id === owner.route?.id);
  return system && owner.route ? { type: "system", section: owner.route.section, entryId: system.id } : undefined;
}

export function addRecent(entries: readonly RecentViewReference[], entry: RecentViewReference): RecentViewReference[] {
  const key = (value: RecentViewReference) =>
    value.type === "system" ? `${value.section}:${value.entryId}` : `workspace:${value.viewId}`;
  return [entry, ...entries.filter((candidate) => key(candidate) !== key(entry))].slice(0, 8);
}
