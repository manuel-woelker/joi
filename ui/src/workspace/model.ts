export type ViewId = string;
export type QueryId = string;
export type PresentationId = string;
export type NavigationId = string;

export type TicketStatus = "open" | "in-progress" | "closed";

export interface Ticket {
  id: string;
  key: string;
  title: string;
  description: string;
  status: TicketStatus;
}

export type TicketField = keyof Ticket;
export type FilterOperator = "equals" | "not-equals" | "in" | "contains";

export interface FilterDefinition {
  field: TicketField;
  operator: FilterOperator;
  value: string | string[];
}

export interface SortDefinition {
  field: TicketField;
  direction: "ascending" | "descending";
}

export interface QueryDefinition {
  id: QueryId;
  name: string;
  source: "tickets";
  filters: FilterDefinition[];
  sorting: SortDefinition[];
}

export interface PresentationField {
  field: TicketField;
  label: string;
  width?: number;
}

export interface PresentationDefinition {
  id: PresentationId;
  name: string;
  source: "tickets";
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
  version: 2;
  queries: Record<QueryId, QueryDefinition>;
  presentations: Record<PresentationId, PresentationDefinition>;
  views: Record<ViewId, SavedView>;
  navigation: Record<NavigationId, NavigationItem>;
  rootItems: NavigationId[];
  favorites: ViewId[];
}

export const ticketFields: Record<TicketField, { label: string; type: "string" }> = {
  id: { label: "ID", type: "string" },
  key: { label: "Key", type: "string" },
  title: { label: "Title", type: "string" },
  description: { label: "Description", type: "string" },
  status: { label: "Status", type: "string" },
};
