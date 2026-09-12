import { createSignal } from "solid-js";

import type { ComponentDemo } from "../../plugins/core/playground/demo";
import { FilterDefinitionEditor } from "./FilterDefinitionEditor";
import {
  createCompositeFilter,
  createFilterCriterion,
  filterAttributeId,
  filterNodeId,
  type FilterDefinition,
} from "./filter-model";
import {
  containsFilterOperator,
  equalsFilterOperator,
  inRangeFilterOperator,
  inSetFilterOperator,
  lessThanFilterOperator,
  unsetFilterOperator,
  type FilterableAttribute,
} from "./filter-operators";

const attributes: readonly FilterableAttribute[] = [
  { id: filterAttributeId("title"), label: "Title", valueType: "string" },
  {
    id: filterAttributeId("status"),
    label: "Status",
    valueType: "string",
    values: [
      { value: "open", label: "Open" },
      { value: "in-progress", label: "In progress" },
      { value: "closed", label: "Closed" },
    ],
  },
  { id: filterAttributeId("estimate"), label: "Estimate", valueType: "int" },
  {
    id: filterAttributeId("assignee"),
    label: "Assignee",
    valueType: "string",
    loadValues: async (query) => {
      const entries = [
        { value: "jane", label: "Jane Developer", description: "Engineering" },
        { value: "joe", label: "Joe Tester", description: "Quality assurance" },
      ].filter((entry) => entry.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
      await Promise.resolve();
      return { entries, total: entries.length };
    },
  },
];

function Editor(props: { initial: FilterDefinition }) {
  const [filter, setFilter] = createSignal<FilterDefinition>(props.initial);
  return <FilterDefinitionEditor attributes={attributes} value={filter()} onChange={setFilter} />;
}

function Basic() {
  return (
    <Editor
      initial={createCompositeFilter(
        "all",
        [
          createFilterCriterion(
            filterAttributeId("title"),
            containsFilterOperator,
            { type: "value", value: "navigation" },
            filterNodeId("basic-title"),
          ),
        ],
        filterNodeId("basic-root"),
      )}
    />
  );
}

function Empty() {
  return <Editor initial={createCompositeFilter("all", [], filterNodeId("empty-root"))} />;
}

function Nested() {
  return (
    <Editor
      initial={createCompositeFilter(
        "all",
        [
          createFilterCriterion(
            filterAttributeId("status"),
            inSetFilterOperator,
            { type: "set", values: ["open", "in-progress"] },
            filterNodeId("nested-status"),
          ),
          createCompositeFilter(
            "one",
            [
              createFilterCriterion(
                filterAttributeId("estimate"),
                lessThanFilterOperator,
                { type: "value", value: 5 },
                filterNodeId("nested-small"),
              ),
              createCompositeFilter(
                "none",
                [
                  createFilterCriterion(
                    filterAttributeId("title"),
                    equalsFilterOperator,
                    { type: "value", value: "Blocked" },
                    filterNodeId("nested-blocked"),
                  ),
                ],
                filterNodeId("nested-none"),
              ),
            ],
            filterNodeId("nested-one"),
          ),
        ],
        filterNodeId("nested-root"),
      )}
    />
  );
}

function OperandShapes() {
  return (
    <Editor
      initial={createCompositeFilter(
        "all",
        [
          createFilterCriterion(
            filterAttributeId("estimate"),
            inRangeFilterOperator,
            { type: "range", minimum: 2, maximum: 8 },
            filterNodeId("shape-range"),
          ),
          createFilterCriterion(
            filterAttributeId("status"),
            inSetFilterOperator,
            { type: "set", values: ["open"] },
            filterNodeId("shape-set"),
          ),
          createFilterCriterion(
            filterAttributeId("assignee"),
            unsetFilterOperator,
            undefined,
            filterNodeId("shape-unset"),
          ),
        ],
        filterNodeId("shape-root"),
      )}
    />
  );
}

function Disabled() {
  const criterion = createFilterCriterion(
    filterAttributeId("status"),
    equalsFilterOperator,
    { type: "value", value: "closed" },
    filterNodeId("disabled-status"),
  );
  return (
    <Editor
      initial={createCompositeFilter("none", [{ ...criterion, disabled: true }], filterNodeId("disabled-root"))}
    />
  );
}

function AsyncChoice() {
  return (
    <Editor
      initial={createCompositeFilter(
        "all",
        [
          createFilterCriterion(
            filterAttributeId("assignee"),
            equalsFilterOperator,
            { type: "value", value: "jane" },
            filterNodeId("async-assignee"),
          ),
        ],
        filterNodeId("async-root"),
      )}
    />
  );
}

export default {
  name: "Filter definition",
  description: "Builds nested attribute filters with typed operands and drag-and-drop ordering.",
  scenarios: [
    {
      name: "Empty",
      description: "An empty group exposes its validation state and add commands.",
      render: Empty,
    },
    { name: "Basic", description: "A single string criterion in an all group.", render: Basic },
    { name: "Nested groups", description: "All, one, and none groups can be nested and reordered.", render: Nested },
    {
      name: "Operand shapes",
      description: "Range, set, and operand-free operators choose appropriate controls.",
      render: OperandShapes,
    },
    {
      name: "Disabled criterion",
      description: "Disabled definitions remain editable without taking part in evaluation.",
      render: Disabled,
    },
    {
      name: "Asynchronous values",
      description: "A scalar operand can query and render values asynchronously.",
      render: AsyncChoice,
    },
  ],
} satisfies ComponentDemo;
