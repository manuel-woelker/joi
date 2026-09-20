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

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["+−Open12", "+−In review5", "+−Closed2"]);
    expect(facet.values.map((entry) => entry.label)).toEqual(["Closed", "Open", "In review"]);
  });

  it("toggles include and exclude independently with only one active", () => {
    const changes: [string, string, FacetValueState][] = [];
    function ControlledFacet() {
      const [states, setStates] = createSignal<Record<string, FacetValueState>>({});
      return (
        <FacetFilter
          facets={[
            {
              ...facet,
              values: facet.values.map((entry) => ({ ...entry, state: states()[entry.value] })),
            },
          ]}
          onValueChange={(facetId, value, next) => {
            changes.push([facetId, value, next]);
            setStates((current) => ({ ...current, [value]: next }));
          }}
        />
      );
    }

    render(() => <ControlledFacet />);
    const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");
    expect(pressed("Include Open in Status")).toBe("false");
    expect(pressed("Exclude Open from Status")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Include Open in Status" }));
    expect(changes.at(-1)).toEqual(["status", "open", "included"]);
    expect(pressed("Include Open in Status")).toBe("true");
    expect(pressed("Exclude Open from Status")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Include Open in Status" }));
    expect(changes.at(-1)).toEqual(["status", "open", "neutral"]);
    expect(pressed("Include Open in Status")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Exclude Open from Status" }));
    expect(changes.at(-1)).toEqual(["status", "open", "excluded"]);
    expect(pressed("Exclude Open from Status")).toBe("true");
    expect(pressed("Include Open in Status")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Include Open in Status" }));
    expect(changes.at(-1)).toEqual(["status", "open", "included"]);
    expect(pressed("Include Open in Status")).toBe("true");
    expect(pressed("Exclude Open from Status")).toBe("false");
  });
});
