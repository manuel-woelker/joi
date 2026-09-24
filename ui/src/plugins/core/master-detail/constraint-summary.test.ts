import { describe, expect, it } from "vitest";
import {
  createCompositeFilter,
  createFilterCriterion,
  filterAttributeId,
  filterOperatorId,
} from "../../../components/filter-definition/filter-model";
import type { EntityDescription } from "../entities/entity-description";
import { entityId } from "../entities/entity-description";
import { summarizeFacets, summarizeFilter } from "./constraint-summary";

const entity: EntityDescription = {
  id: entityId("ticket"),
  tableName: "tickets",
  label: "Ticket",
  pluralLabel: "Tickets",
  icon: () => null,
  identityAttribute: "id",
  attributes: [
    { id: "id", label: "ID", valueType: "string" },
    { id: "name", label: "Name", valueType: "string", facet: true },
    { id: "state", label: "State", valueType: "string", facet: true },
  ],
};

describe("constraint summaries", () => {
  it("preserves nested groups and omits disabled criteria", () => {
    const filter = createCompositeFilter("all", [
      createFilterCriterion(filterAttributeId("name"), filterOperatorId("contains"), { type: "value", value: "fix" }),
      createCompositeFilter("none", [
        createFilterCriterion(filterAttributeId("state"), filterOperatorId("equals"), {
          type: "value",
          value: "closed",
        }),
      ]),
      { ...createFilterCriterion(filterAttributeId("id"), filterOperatorId("set")), disabled: true },
    ]);

    expect(summarizeFilter(filter, entity)).toEqual([
      { text: "All of", depth: 0 },
      { text: 'Name contains "fix"', depth: 1 },
      { text: "None of", depth: 1 },
      { text: 'State = "closed"', depth: 2 },
    ]);
  });

  it("keeps include and exclude facet selections separate", () => {
    expect(
      summarizeFacets(
        [
          { attribute: "state", value: "open", state: "included" },
          { attribute: "state", value: "closed", state: "excluded" },
        ],
        entity,
      ),
    ).toEqual([
      { attribute: "State", lookup: undefined, value: "open", state: "included" },
      { attribute: "State", lookup: undefined, value: "closed", state: "excluded" },
    ]);
  });

  it("quotes each value in set and range operands", () => {
    const filter = createCompositeFilter("all", [
      createFilterCriterion(filterAttributeId("state"), filterOperatorId("in-set"), {
        type: "set",
        values: ["open", 'needs "review"'],
      }),
      createFilterCriterion(filterAttributeId("id"), filterOperatorId("in-range"), {
        type: "range",
        minimum: 1,
        maximum: 10,
      }),
    ]);

    expect(summarizeFilter(filter, entity)).toEqual([
      { text: "All of", depth: 0 },
      { text: 'State is one of "open", "needs \\"review\\""', depth: 1 },
      { text: 'ID is in range "1" to "10"', depth: 1 },
    ]);
  });
});
