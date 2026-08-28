import type { WorkspaceDocument } from "./model";

export function createSeedWorkspace(): WorkspaceDocument {
  return {
    version: 2,
    queries: {
      "query-open": {
        id: "query-open",
        name: "Active issues",
        source: "tickets",
        filters: [{ field: "status", operator: "in", value: ["open", "in-progress"] }],
        sorting: [{ field: "id", direction: "ascending" }],
      },
      "query-all": {
        id: "query-all",
        name: "All issues",
        source: "tickets",
        filters: [],
        sorting: [{ field: "id", direction: "ascending" }],
      },
      "query-closed": {
        id: "query-closed",
        name: "Closed issues",
        source: "tickets",
        filters: [{ field: "status", operator: "equals", value: "closed" }],
        sorting: [{ field: "id", direction: "ascending" }],
      },
    },
    presentations: {
      "presentation-table": {
        id: "presentation-table",
        name: "Issue table",
        source: "tickets",
        layout: "table",
        density: "compact",
        fields: [
          { field: "id", label: "ID", width: 100 },
          { field: "title", label: "Issue" },
          { field: "status", label: "Status", width: 120 },
          { field: "description", label: "Description" },
        ],
      },
      "presentation-list": {
        id: "presentation-list",
        name: "Issue list",
        source: "tickets",
        layout: "list",
        density: "comfortable",
        fields: [
          { field: "title", label: "Issue" },
          { field: "status", label: "Status" },
          { field: "description", label: "Description" },
        ],
      },
    },
    views: {
      "view-active": {
        id: "view-active",
        name: "Active issues",
        description: "Open work across the project",
        queryId: "query-open",
        presentationId: "presentation-table",
      },
      "view-closed": {
        id: "view-closed",
        name: "Closed issues",
        description: "Completed work",
        queryId: "query-closed",
        presentationId: "presentation-table",
      },
      "view-all": {
        id: "view-all",
        name: "All issues",
        description: "Complete issue history",
        queryId: "query-all",
        presentationId: "presentation-list",
      },
    },
    navigation: {
      "folder-work": { id: "folder-work", type: "folder", name: "Work", children: ["nav-active", "nav-closed"] },
      "folder-archive": { id: "folder-archive", type: "folder", name: "Reference", children: ["nav-all"] },
      "nav-active": { id: "nav-active", type: "view", viewId: "view-active" },
      "nav-closed": { id: "nav-closed", type: "view", viewId: "view-closed" },
      "nav-all": { id: "nav-all", type: "view", viewId: "view-all" },
    },
    rootItems: ["folder-work", "folder-archive"],
    favorites: ["view-active"],
  };
}
