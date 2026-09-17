// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

import { FacetFilter, type Facet, type FacetValueState } from "./FacetFilter";

afterEach(cleanup);

const facet: Facet = {
  id: "status",
  label: "Status",
  values: [
    { value: "closed", label: "Closed", count: 2 },
    { value: "open", label: "Open", count: 12 },
    { value: "review", label: "In review", count: 5 },
  ],
};

describe("FacetFilter", () => {
  it("orders values by descending match count without mutating the input", () => {
    render(() => <FacetFilter facets={[facet]} onValueChange={() => undefined} />);

    const rows = within(screen.getByRole("list")).getAllByRole("button");
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Status: Open. Not filtered. 12 matches.",
      "Status: In review. Not filtered. 5 matches.",
      "Status: Closed. Not filtered. 2 matches.",
    ]);
    expect(facet.values.map((entry) => entry.label)).toEqual(["Closed", "Open", "In review"]);
  });

  it("cycles values through included, excluded, and neutral states", () => {
    function ControlledFacet() {
      const [state, setState] = createSignal<FacetValueState>("neutral");
      return (
        <FacetFilter
          facets={[{ ...facet, values: [{ value: "open", label: "Open", count: 12, state: state() }] }]}
          onValueChange={(_facetId, _value, next) => setState(next)}
        />
      );
    }

    render(() => <ControlledFacet />);
    expect(screen.getByRole("button").dataset.state).toBe("neutral");
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").dataset.state).toBe("included");
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").dataset.state).toBe("excluded");
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").dataset.state).toBe("neutral");
  });
});
