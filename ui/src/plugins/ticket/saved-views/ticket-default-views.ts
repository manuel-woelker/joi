import { entityId } from "../../core/entities/entity-description";
import type { WorkspaceDocument } from "../../core/saved-views/model";
import { filterAttributeId, filterNodeId } from "../../../components/filter-definition/filter-model";
import { inSetFilterOperator } from "../../../components/filter-definition/filter-operators";

export function createTicketDefaultWorkspace(): WorkspaceDocument {
  return {
    version: 5,
    queries: {
      "query-open": {
        id: "query-open",
        name: "Active issues",
        entityId: entityId("tickets"),
        filter: {
          id: filterNodeId("ticket-open-status"),
          type: "criterion",
          attribute: filterAttributeId("status"),
          operator: inSetFilterOperator,
          operand: { type: "set", values: ["open", "in-progress"] },
        },
        sorting: [{ field: "id", direction: "ascending" }],
      },
      "query-all": {
        id: "query-all",
        name: "All issues",
        entityId: entityId("tickets"),
        sorting: [{ field: "id", direction: "ascending" }],
      },
      "query-closed": {
        id: "query-closed",
        name: "Closed issues",
        entityId: entityId("tickets"),
        filter: {
          id: filterNodeId("ticket-closed-status"),
          type: "criterion",
          attribute: filterAttributeId("status"),
          operator: inSetFilterOperator,
          operand: { type: "set", values: ["closed", "wontfix"] },
        },
        sorting: [{ field: "id", direction: "ascending" }],
      },
    },
    presentations: {
      "presentation-table": {
        id: "presentation-table",
        name: "Issue table",
        entityId: entityId("tickets"),
        layout: "table",
        density: "compact",
        fields: [
          { field: "key", width: 100 },
          { field: "project_id", width: 180 },
          { field: "title", label: "Issue" },
          { field: "status", width: 120 },
          { field: "assignee", width: 160 },
          { field: "description" },
        ],
      },
      "presentation-list": {
        id: "presentation-list",
        name: "Issue list",
        entityId: entityId("tickets"),
        layout: "list",
        density: "comfortable",
        fields: [{ field: "title", label: "Issue" }, { field: "status" }, { field: "description" }],
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
    navigation: {},
    rootItems: [],
  };
}
