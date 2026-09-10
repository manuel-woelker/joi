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
}

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

export type NavigationItem = FolderNavigationItem | ViewNavigationItem;

export interface WorkspaceDocument {
  version: 3;
  queries: Record<QueryId, QueryDefinition>;
  presentations: Record<PresentationId, PresentationDefinition>;
  views: Record<ViewId, SavedView>;
  navigation: Record<NavigationId, NavigationItem>;
  rootItems: NavigationId[];
  favorites: ViewId[];
}
import type { EntityId } from "../entities/entity-description";
import type { QueryValue } from "../query/query-result";
