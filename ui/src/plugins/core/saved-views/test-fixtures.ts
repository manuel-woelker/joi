import type { IconComponent } from "../../../icons/icon-component";
import { defineEntity, entityId } from "../entities/entity-description";
import type { WorkspaceDocument } from "./model";
import { filterAttributeId, filterNodeId } from "../../../components/filter-definition/filter-model";
import { inSetFilterOperator } from "../../../components/filter-definition/filter-operators";

const TestIcon = (() => null) as IconComponent;

export const testEntity = defineEntity({
  id: entityId("things"),
  tableName: "things",
  label: "Thing",
  pluralLabel: "Things",
  icon: TestIcon,
  identityAttribute: "id",
  attributes: [
    { id: "id", label: "ID", valueType: "string" },
    { id: "key", label: "Key", valueType: "string" },
    { id: "title", label: "Title", valueType: "string" },
    { id: "description", label: "Description", valueType: "string" },
    { id: "status", label: "Status", valueType: "string", facet: true },
  ],
});

export function createTestWorkspace(): WorkspaceDocument {
  return {
    version: 5,
    queries: {
      "query-open": {
        id: "query-open",
        name: "Active things",
        entityId: testEntity.id,
        filter: {
          id: filterNodeId("test-open-status"),
          type: "criterion",
          attribute: filterAttributeId("status"),
          operator: inSetFilterOperator,
          operand: { type: "set", values: ["open", "in-progress"] },
        },
        sorting: [{ field: "id", direction: "ascending" }],
      },
      "query-all": {
        id: "query-all",
        name: "All things",
        entityId: testEntity.id,
        sorting: [{ field: "id", direction: "ascending" }],
      },
    },
    presentations: {
      "presentation-table": {
        id: "presentation-table",
        name: "Thing table",
        entityId: testEntity.id,
        layout: "table",
        density: "compact",
        fields: [{ field: "key" }, { field: "title" }, { field: "status" }],
      },
    },
    views: {
      "view-active": {
        id: "view-active",
        name: "Active things",
        queryId: "query-open",
        presentationId: "presentation-table",
      },
      "view-all": {
        id: "view-all",
        name: "All things",
        queryId: "query-all",
        presentationId: "presentation-table",
      },
    },
    navigation: {
      "folder-work": { id: "folder-work", type: "folder", name: "Work", children: ["nav-active"] },
      "nav-active": { id: "nav-active", type: "view", viewId: "view-active" },
      "nav-all": { id: "nav-all", type: "view", viewId: "view-all" },
    },
    rootItems: ["folder-work", "nav-all"],
  };
}
