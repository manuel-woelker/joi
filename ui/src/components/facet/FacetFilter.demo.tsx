import { createSignal } from "solid-js";

import type { ComponentDemo } from "../../plugins/core/playground/demo";
import { FacetFilter, type Facet, type FacetValueState } from "./FacetFilter";

const baseFacets: readonly Facet[] = [
  {
    id: "status",
    label: "Status",
    description: "Current workflow state",
    values: [
      { value: "open", label: "Open", count: 842 },
      { value: "review", label: "In review", count: 164 },
      { value: "reworking", label: "Reworking", count: 73 },
      { value: "closed", label: "Closed", count: 1276 },
    ],
  },
  {
    id: "assignee",
    label: "Assignee",
    values: [
      { value: "jane", label: "Jane Developer", count: 418 },
      { value: "joe", label: "Joe Tester", count: 307 },
      { value: "unassigned", label: "Unassigned", count: 92 },
    ],
  },
  {
    id: "project",
    label: "Project",
    values: [
      { value: "demo", label: "Demo", count: 117 },
      { value: "test", label: "Test", count: 700 },
    ],
  },
];

function InteractiveFacets() {
  const [facets, setFacets] = createSignal(baseFacets);
  const update = (facetId: string, value: string, state: FacetValueState) => {
    setFacets((current) =>
      current.map((facet) =>
        facet.id === facetId
          ? { ...facet, values: facet.values.map((entry) => (entry.value === value ? { ...entry, state } : entry)) }
          : facet,
      ),
    );
  };
  return <FacetFilter facets={facets()} onValueChange={update} />;
}

export default {
  name: "Facet filter",
  description: "Filters results by including or excluding discrete attribute values and their match counts.",
  scenarios: [
    {
      name: "Multiple facets",
      description: "Values are ordered by match count and cycle through included, excluded, and neutral states.",
      render: () => <InteractiveFacets />,
    },
    {
      name: "Selected values",
      description: "Included values stand out while excluded values remain visible but subdued.",
      render: () => (
        <FacetFilter
          facets={baseFacets.map((facet) => ({
            ...facet,
            values: facet.values.map((entry, index) => ({
              ...entry,
              state: index === 0 ? "included" : index === 1 ? "excluded" : "neutral",
            })),
          }))}
          onValueChange={() => undefined}
        />
      ),
    },
    {
      name: "Edge cases",
      description: "Long values are contained, zero matches remain available, and empty facets have a clear state.",
      render: () => (
        <FacetFilter
          facets={[
            {
              id: "labels",
              label: "Labels",
              values: [
                { value: "long", label: "A deliberately long label that must not widen the panel", count: 12 },
                { value: "none", label: "No matches", count: 0 },
              ],
            },
            { id: "milestone", label: "Milestone", values: [] },
          ]}
          onValueChange={() => undefined}
        />
      ),
    },
  ],
} satisfies ComponentDemo;
