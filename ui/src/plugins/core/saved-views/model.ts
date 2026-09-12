export type ViewId = string;
export type QueryId = string;
export type PresentationId = string;
export type NavigationId = string;
export type AttributeName = string;

export type FilterOperator = "equals" | "not-equals" | "in" | "contains";

export interface FilterDefinition {
  field: AttributeName;
  operator: FilterOperator;
  value: QueryValue | QueryValue[];
}

export interface SortDefinition {
  field: AttributeName;
  direction: "ascending" | "descending";
}

export interface QueryDefinition {
  id: QueryId;
  name: string;
  entityId: EntityId;
  filters: FilterDefinition[];
  sorting: SortDefinition[];
}

export interface PresentationField {
  field: AttributeName;
  label?: string;
  width?: number;
}

export interface PresentationDefinition {
  id: PresentationId;
  name: string;
  entityId: EntityId;
  layout: "table" | "list";
  density: "compact" | "comfortable";
  fields: PresentationField[];
}

export interface SavedView {
  id: ViewId;
  name: string;
  description?: string;
  queryId: QueryId;
  presentationId: PresentationId;
  sourceNavigationEntryId?: string;
}

export interface WorkspaceViewDraft {
  readonly name: string;
  readonly description?: string;
  readonly query: Omit<QueryDefinition, "id">;
  readonly presentation: Omit<PresentationDefinition, "id">;
  readonly sourceNavigationEntryId?: string;
}

export interface WorkspaceShortcutDraft {
  readonly name: string;
  readonly description?: string;
  readonly selection: NavigationSelection;
  readonly sourceNavigationEntryId: string;
}

export type WorkspaceEntryDraft =
  | { readonly type: "view"; readonly view: WorkspaceViewDraft }
  | { readonly type: "shortcut"; readonly shortcut: WorkspaceShortcutDraft };

export interface FolderNavigationItem {
  id: NavigationId;
  type: "folder";
  name: string;
  children: NavigationId[];
}

export interface ViewNavigationItem {
  id: NavigationId;
  type: "view";
  viewId: ViewId;
}

export interface ShortcutNavigationItem {
  id: NavigationId;
  type: "shortcut";
  name: string;
  description?: string;
  selection: NavigationSelection;
  sourceNavigationEntryId: string;
}

export type NavigationItem = FolderNavigationItem | ViewNavigationItem | ShortcutNavigationItem;

export interface WorkspaceDocument {
  version: 4;
  queries: Record<QueryId, QueryDefinition>;
  presentations: Record<PresentationId, PresentationDefinition>;
  views: Record<ViewId, SavedView>;
  navigation: Record<NavigationId, NavigationItem>;
  rootItems: NavigationId[];
}
import type { NavigationSelection } from "../../../base/navigation";
import type { EntityId } from "../entities/entity-description";
import type { QueryValue } from "../query/query-result";
