import type { Ticket, WorkspaceDocument } from "./model";

export const tickets: Ticket[] = [
  { id: "JOI-142", title: "Preserve view state after reload", status: "in-progress", priority: "high", assignee: "Mira", updatedAt: "2026-08-23" },
  { id: "JOI-139", title: "Add keyboard navigation to trees", status: "open", priority: "high", assignee: "Noah", updatedAt: "2026-08-22" },
  { id: "JOI-136", title: "Clarify reusable presentation editing", status: "open", priority: "medium", assignee: "Mira", updatedAt: "2026-08-21" },
  { id: "JOI-128", title: "Improve empty query feedback", status: "closed", priority: "low", assignee: "Sam", updatedAt: "2026-08-18" },
  { id: "JOI-121", title: "Support compact table density", status: "closed", priority: "medium", assignee: "Noah", updatedAt: "2026-08-15" },
];

export function createSeedWorkspace(): WorkspaceDocument {
  return {
    version: 1,
    queries: {
      "query-open": {
        id: "query-open",
        name: "Active issues",
        source: "tickets",
        filters: [{ field: "status", operator: "in", value: ["open", "in-progress"] }],
        sorting: [{ field: "updatedAt", direction: "descending" }],
      },
      "query-all": {
        id: "query-all",
        name: "All issues",
        source: "tickets",
        filters: [],
        sorting: [{ field: "updatedAt", direction: "descending" }],
      },
      "query-mine": {
        id: "query-mine",
        name: "Assigned to Mira",
        source: "tickets",
        filters: [{ field: "assignee", operator: "equals", value: "Mira" }],
        sorting: [{ field: "priority", direction: "descending" }],
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
          { field: "priority", label: "Priority", width: 100 },
          { field: "assignee", label: "Assignee", width: 120 },
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
          { field: "assignee", label: "Assignee" },
        ],
      },
    },
    views: {
      "view-active": { id: "view-active", name: "Active issues", description: "Open work across the project", queryId: "query-open", presentationId: "presentation-table" },
      "view-mine": { id: "view-mine", name: "My issues", description: "Issues currently assigned to Mira", queryId: "query-mine", presentationId: "presentation-table" },
      "view-all": { id: "view-all", name: "All issues", description: "Complete issue history", queryId: "query-all", presentationId: "presentation-list" },
    },
    navigation: {
      "folder-work": { id: "folder-work", type: "folder", name: "Work", children: ["nav-active", "nav-mine"] },
      "folder-archive": { id: "folder-archive", type: "folder", name: "Reference", children: ["nav-all"] },
      "nav-active": { id: "nav-active", type: "view", viewId: "view-active" },
      "nav-mine": { id: "nav-mine", type: "view", viewId: "view-mine" },
      "nav-all": { id: "nav-all", type: "view", viewId: "view-all" },
    },
    rootItems: ["folder-work", "folder-archive"],
    favorites: ["view-active"],
  };
}
